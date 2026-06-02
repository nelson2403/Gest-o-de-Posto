import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

// PATCH — fiscal/master reabre tarefa concluída indevidamente → volta para nf_rejeitada
export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { data: usuario } = await supabase
      .from('usuarios')
      .select('role')
      .eq('id', user.id)
      .single()

    const canFiscal = usuario?.role === 'master' || usuario?.role === 'adm_fiscal'
    if (!canFiscal) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const { data: tarefa, error: errTarefa } = await supabase
      .from('fiscal_tarefas')
      .select('status')
      .eq('id', id)
      .single()

    if (errTarefa || !tarefa) {
      return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })
    }
    if (tarefa.status !== 'concluida' && tarefa.status !== 'desconhecida') {
      return NextResponse.json({ error: 'Apenas tarefas concluídas ou desconhecidas podem ser reabertas' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('fiscal_tarefas')
      .update({
        status:        'nf_rejeitada',
        concluida_em:  null,
        lancado_em:    null,
        atualizada_em: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ tarefa: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
