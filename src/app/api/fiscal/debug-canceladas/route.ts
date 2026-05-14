import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { queryAS } from '@/lib/autosystem'
import { createAdminClient } from '@/lib/supabase/admin'

// POST — deleta tarefas fiscais pendentes cujas NFs foram canceladas no AS
export async function POST(_req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const admin = createAdminClient()

    // Busca todas as tarefas pendentes com grid mapeado
    const { data: tarefas } = await admin
      .from('fiscal_tarefas')
      .select('id, nfe_resumo_grid')
      .in('status', ['pendente_gerente', 'nf_rejeitada'])
      .not('nfe_resumo_grid', 'is', null)

    if (!tarefas?.length) return NextResponse.json({ deletadas: 0 })

    const grids = tarefas.map((t: any) => t.nfe_resumo_grid)

    // Verifica quais grids correspondem a NFs canceladas no AS
    const canceladasNaBase = await queryAS(
      `SELECT DISTINCT nr.grid::bigint
       FROM nfe_resumo nr
       JOIN nfe_manifestacao nm ON nm.nfe = nr.nfe
       WHERE nr.grid = ANY($1::bigint[])
         AND nm.situacao_nfe = 3`,
      [grids],
    )

    const gridsCancelados = new Set(canceladasNaBase.map((r: any) => String(r.grid)))
    const idsParaDeletar = tarefas
      .filter((t: any) => gridsCancelados.has(String(t.nfe_resumo_grid)))
      .map((t: any) => t.id)

    if (!idsParaDeletar.length) return NextResponse.json({ deletadas: 0 })

    const { error } = await admin
      .from('fiscal_tarefas')
      .delete()
      .in('id', idsParaDeletar)

    if (error) throw error

    return NextResponse.json({ deletadas: idsParaDeletar.length, ids: idsParaDeletar })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// GET — diagnóstico direto de manifestos cancelados dentro dos últimos 90 dias
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const admin = createAdminClient()
    const { data: postos } = await admin
      .from('postos')
      .select('codigo_empresa_externo')
      .not('codigo_empresa_externo', 'is', null)

    const empresaGrids = (postos ?? []).map((p: any) => Number(p.codigo_empresa_externo))

    // A: Quantas NFs passam no filtro ATUAL (sem o fix de canceladas)
    const [totalAtual] = await queryAS(
      `SELECT COUNT(DISTINCT nr.grid)::int AS total
       FROM nfe_resumo nr
       WHERE nr.empresa = ANY($1::bigint[])
         AND nr.data_emissao >= (NOW() - INTERVAL '90 days')::date
         AND EXISTS (SELECT 1 FROM nfe_manifestacao nm WHERE nm.nfe = nr.nfe)
         AND NOT EXISTS (
           SELECT 1 FROM nfe_manifestacao nm
           WHERE nm.nfe = nr.nfe AND nm.nfe_evento IN (210200, 210220, 210240)
         )`,
      [empresaGrids],
    )

    // B: Quantas passariam COM o fix (excluindo situacao_nfe=3)
    const [totalComFix] = await queryAS(
      `SELECT COUNT(DISTINCT nr.grid)::int AS total
       FROM nfe_resumo nr
       WHERE nr.empresa = ANY($1::bigint[])
         AND nr.data_emissao >= (NOW() - INTERVAL '90 days')::date
         AND EXISTS (SELECT 1 FROM nfe_manifestacao nm WHERE nm.nfe = nr.nfe)
         AND NOT EXISTS (
           SELECT 1 FROM nfe_manifestacao nm
           WHERE nm.nfe = nr.nfe AND nm.nfe_evento IN (210200, 210220, 210240)
         )
         AND NOT EXISTS (
           SELECT 1 FROM nfe_manifestacao nm
           WHERE nm.nfe = nr.nfe AND nm.situacao_nfe = 3
         )`,
      [empresaGrids],
    )

    // C: As NFs canceladas dentro de 90 dias que serão excluídas pelo fix
    const canceladasFiltradas = await queryAS(
      `SELECT nr.grid::bigint, nr.empresa::bigint,
              nr.emitente_nome::text,
              to_char(nr.data_emissao,'YYYY-MM-DD') AS data_emissao,
              nr.valor::float,
              nm_sit.situacao_nfe,
              nm_sit.nfe_evento
       FROM nfe_resumo nr
       JOIN LATERAL (
         SELECT nfe_evento, situacao_nfe
         FROM nfe_manifestacao nm2
         WHERE nm2.nfe = nr.nfe
         ORDER BY nm2.grid DESC
         LIMIT 1
       ) nm_sit ON true
       WHERE nr.empresa = ANY($1::bigint[])
         AND nr.data_emissao >= (NOW() - INTERVAL '90 days')::date
         AND EXISTS (SELECT 1 FROM nfe_manifestacao nm WHERE nm.nfe = nr.nfe)
         AND NOT EXISTS (
           SELECT 1 FROM nfe_manifestacao nm
           WHERE nm.nfe = nr.nfe AND nm.nfe_evento IN (210200, 210220, 210240)
         )
         AND EXISTS (
           SELECT 1 FROM nfe_manifestacao nm
           WHERE nm.nfe = nr.nfe AND nm.situacao_nfe = 3
         )
       ORDER BY nr.data_emissao DESC
       LIMIT 20`,
      [empresaGrids],
    )

    // D: Tarefas já criadas cujas NFs estão canceladas (para limpeza)
    const { data: tarefasPendentes } = await admin
      .from('fiscal_tarefas')
      .select('id, nfe_resumo_grid, fornecedor_nome, empresa_grid')
      .eq('status', 'pendente_gerente')

    let tarefasCanceladas: any[] = []
    if (tarefasPendentes?.length) {
      const grids = tarefasPendentes.map(t => t.nfe_resumo_grid).filter(Boolean)
      if (grids.length) {
        const canceladasNaBase = await queryAS(
          `SELECT DISTINCT nr.grid::bigint
           FROM nfe_resumo nr
           JOIN nfe_manifestacao nm ON nm.nfe = nr.nfe
           WHERE nr.grid = ANY($1::bigint[])
             AND nm.situacao_nfe = 3`,
          [grids],
        )
        const gridsCancelados = new Set(canceladasNaBase.map((r: any) => String(r.grid)))
        tarefasCanceladas = tarefasPendentes.filter(t =>
          gridsCancelados.has(String(t.nfe_resumo_grid))
        )
      }
    }

    return NextResponse.json({
      periodo: 'últimos 90 dias',
      total_sem_fix: totalAtual?.total ?? 0,
      total_com_fix: totalComFix?.total ?? 0,
      canceladas_que_seriam_excluidas: canceladasFiltradas.length,
      amostra_canceladas: canceladasFiltradas,
      tarefas_pendentes_de_nfs_canceladas: tarefasCanceladas,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
