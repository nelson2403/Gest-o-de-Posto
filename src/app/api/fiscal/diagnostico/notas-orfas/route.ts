import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — diagnostica notas que estão no painel mas não no AUTOSYSTEM
export async function GET(req: NextRequest) {
  try {
    const admin = createAdminClient()
    const { searchParams } = new URL(req.url)
    const postoNome = searchParams.get('posto')

    // Se filtro por posto, primeiro encontra o ID
    let postoId: string | null = null
    if (postoNome) {
      const { data: posto } = await admin
        .from('postos')
        .select('id')
        .ilike('nome', `%${postoNome}%`)
        .single()
      postoId = posto?.id ?? null
    }

    // Busca todas as notas com status pendente ou aguardando (filtro opcional por posto)
    let query = admin
      .from('fiscal_tarefas')
      .select(`
        id,
        nfe_resumo_grid,
        fornecedor_nome,
        valor_as,
        data_emissao,
        status,
        criada_em,
        atualizada_em,
        nf_anexada_em,
        postos(nome)
      `)
      .in('status', ['pendente_gerente', 'aguardando_fiscal', 'nf_rejeitada'])
      .order('data_emissao', { ascending: false })

    if (postoId) {
      query = query.eq('posto_id', postoId)
    }

    const { data: notas } = await query

    // Separa notas com e sem nfe_resumo_grid
    const comGrid = (notas ?? []).filter(n => n.nfe_resumo_grid)
    const semGrid = (notas ?? []).filter(n => !n.nfe_resumo_grid)

    return NextResponse.json({
      resumo: {
        total: notas?.length ?? 0,
        com_grid: comGrid.length,
        sem_grid: semGrid.length,
      },
      notas_sincronizadas: comGrid,
      notas_orfas: semGrid,
      diagnostico: {
        notas_sem_grid: semGrid.length > 0 ? 'Essas notas foram criadas MANUALMENTE, não sincronizadas do AS' : 'OK',
        notas_com_grid: comGrid.length > 0 ? `Essas ${comGrid.length} notas foram sincronizadas do AS mas podem ter sido deletadas lá` : 'OK',
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
