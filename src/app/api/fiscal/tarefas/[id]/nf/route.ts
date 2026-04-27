import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

// PATCH — gerente anexa NF; sistema valida valor vs AS
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const body = await req.json()
    const { nf_url, nf_valor_informado } = body as { nf_url: string; nf_valor_informado: number }

    // Busca tarefa para validar valor
    const { data: tarefa, error: errTarefa } = await supabase
      .from('fiscal_tarefas')
      .select('valor_as, status')
      .eq('id', id)
      .single()

    if (errTarefa || !tarefa) return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })
    if (tarefa.status === 'concluida') return NextResponse.json({ error: 'Tarefa já concluída' }, { status: 400 })

    // Tolerância de R$ 0,10 para diferença de valor
    const diferenca = Math.abs(Number(nf_valor_informado) - Number(tarefa.valor_as))
    const aprovada = diferenca <= 0.10

    const update: any = {
      nf_url,
      nf_valor_informado,
      nf_aprovada: aprovada,
      nf_aprovada_em: new Date().toISOString(),
      nf_anexada_em: new Date().toISOString(),
      nf_anexada_por: user.id,
      atualizada_em: new Date().toISOString(),
    }

    if (!aprovada) {
      update.status = 'nf_rejeitada'
      update.nf_rejeicao_motivo = `Valor informado R$ ${nf_valor_informado.toFixed(2)} difere do manifesto R$ ${Number(tarefa.valor_as).toFixed(2)} (diferença: R$ ${diferenca.toFixed(2)})`
    }

    const { data, error } = await supabase
      .from('fiscal_tarefas')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ tarefa: data, aprovada, diferenca })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
