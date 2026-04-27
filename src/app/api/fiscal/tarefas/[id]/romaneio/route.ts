import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const body = await req.json()
    const { romaneio_url } = body as { romaneio_url: string }

    const { data: tarefa } = await supabase
      .from('fiscal_tarefas')
      .select('nf_aprovada, boleto_url')
      .eq('id', id)
      .single()

    if (!tarefa?.nf_aprovada) {
      return NextResponse.json({ error: 'NF precisa ser aprovada antes de anexar o romaneio' }, { status: 400 })
    }

    // Se já tem boleto também, avança para aguardando_fiscal
    const novoStatus = tarefa.boleto_url ? 'aguardando_fiscal' : undefined

    const update: any = {
      romaneio_url,
      romaneio_anexado_em: new Date().toISOString(),
      atualizada_em: new Date().toISOString(),
    }
    if (novoStatus) update.status = novoStatus

    const { data, error } = await supabase
      .from('fiscal_tarefas')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
