import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { verificarLancamentoNfe } from '@/lib/autosystem'

// POST — detecta NFs lançadas no AS e conclui as tarefas automaticamente
export async function POST(_req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    // Busca tarefas aguardando fiscal (com chave de NF disponível via nfe_resumo_grid)
    const { data: tarefas } = await supabase
      .from('fiscal_tarefas')
      .select('id, nfe_resumo_grid, nf_valor_informado')
      .eq('status', 'aguardando_fiscal')

    if (!tarefas?.length) return NextResponse.json({ concluidas: 0 })

    // Usa nfe_resumo_grid como documento para checar lmc_entrada
    const documentos = tarefas
      .map(t => t.nfe_resumo_grid?.toString())
      .filter(Boolean) as string[]

    const lancamentos = await verificarLancamentoNfe(documentos)
    const docsLancados = new Set(lancamentos.map(l => l.documento))

    const tarefasConcluir = tarefas.filter(t =>
      docsLancados.has(t.nfe_resumo_grid?.toString() ?? '')
    )

    if (!tarefasConcluir.length) return NextResponse.json({ concluidas: 0 })

    const ids = tarefasConcluir.map(t => t.id)
    const { error } = await supabase
      .from('fiscal_tarefas')
      .update({
        status: 'concluida',
        lancado_em: new Date().toISOString(),
        concluida_em: new Date().toISOString(),
        concluida_por: user.id,
        atualizada_em: new Date().toISOString(),
      })
      .in('id', ids)

    if (error) throw error
    return NextResponse.json({ concluidas: ids.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
