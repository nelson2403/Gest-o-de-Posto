import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buscarNfeManifestos } from '@/lib/autosystem'

const CRON_SECRET = process.env.CRON_SECRET

// Busca NFs dos últimos N dias no AS e cria tarefas fiscais automaticamente
export async function POST(req: NextRequest) {
  if (!CRON_SECRET) return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 500 })
  const secret = req.headers.get('x-cron-secret')
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()

    // Busca postos com empresa mapeada no AS
    const { data: postos, error: errPostos } = await admin
      .from('postos')
      .select('id, nome, codigo_empresa_externo')
      .not('codigo_empresa_externo', 'is', null)

    if (errPostos || !postos?.length) {
      return NextResponse.json({ criadas: 0, motivo: 'nenhum posto mapeado' })
    }

    const empresaGrids = postos.map((p: any) => Number(p.codigo_empresa_externo))
    const manifestos = await buscarNfeManifestos(empresaGrids)

    if (!manifestos.length) return NextResponse.json({ criadas: 0 })

    // Tarefas já existentes para não duplicar.
    // IMPORTANTE: escopar pelos grids dos manifestos. Sem o filtro, o SELECT pega
    // só as 1000 primeiras linhas (limite do Supabase) e, com a tabela > 1000,
    // grids já existentes seriam tratados como novos → INSERT duplicado viola a
    // unique e derruba o lote inteiro (manifestos não eram importados).
    const manifestoGrids = manifestos.map((m: any) => Number(m.grid))
    const { data: existentes } = await admin
      .from('fiscal_tarefas')
      .select('nfe_resumo_grid')
      .in('nfe_resumo_grid', manifestoGrids)

    const gridsExistentes = new Set((existentes ?? []).map((t: any) => String(t.nfe_resumo_grid)))

    // Mapa empresa_grid → posto
    const postoMap = Object.fromEntries(postos.map((p: any) => [Number(p.codigo_empresa_externo), p]))

    const novos = manifestos.filter(m => !gridsExistentes.has(String(m.grid)))

    if (!novos.length) return NextResponse.json({ criadas: 0 })

    const registros = novos.map((m: any) => ({
      nfe_resumo_grid:  m.grid,
      empresa_grid:     m.empresa,
      fornecedor_nome:  m.emitente_nome,
      fornecedor_cpf:   m.emitente_cpf,
      nf_numero:        m.nf_numero ?? null,
      valor_as:         m.valor,
      data_emissao:     m.data_emissao,
      posto_id:         postoMap[m.empresa]?.id ?? null,
      status:           'pendente_gerente',
    }))

    const { data, error } = await admin
      .from('fiscal_tarefas')
      .insert(registros)
      .select('id')

    if (error) throw error

    console.log(`[cron-fiscal] ${new Date().toISOString()} — ${data?.length ?? 0} tarefas criadas`)
    return NextResponse.json({ criadas: data?.length ?? 0 })
  } catch (e: any) {
    console.error('[cron-fiscal] erro:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
