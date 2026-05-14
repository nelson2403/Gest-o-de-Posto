import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

// PATCH — gerente desconhece a NF: fecha a tarefa e fiscal precisa rejeitar no AS
export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { data: tarefa, error: errTarefa } = await supabase
      .from('fiscal_tarefas')
      .select('status')
      .eq('id', id)
      .single()

    if (errTarefa || !tarefa) {
      return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })
    }
    if (tarefa.status === 'concluida' || tarefa.status === 'desconhecida') {
      return NextResponse.json({ error: 'Tarefa já encerrada' }, { status: 400 })
    }

    const agora = new Date().toISOString()

    const { data, error } = await supabase
      .from('fiscal_tarefas')
      .update({
        acao_gerente:         'desconhecida',
        status:               'desconhecida',
        gerente_respondeu_em: agora,
        concluida_em:         agora,
        concluida_por:        user.id,
        atualizada_em:        agora,
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
