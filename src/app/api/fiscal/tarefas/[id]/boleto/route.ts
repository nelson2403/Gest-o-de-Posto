import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const body = await req.json()
    const { boleto_url, boleto_vencimento, boleto_valor } = body as {
      boleto_url: string
      boleto_vencimento: string
      boleto_valor: number
    }

    const { data: tarefa } = await supabase
      .from('fiscal_tarefas')
      .select('nf_aprovada, romaneio_url')
      .eq('id', id)
      .single()

    if (!tarefa?.nf_aprovada) {
      return NextResponse.json({ error: 'NF precisa ser aprovada antes de anexar o boleto' }, { status: 400 })
    }

    // Se já tem romaneio, avança para aguardando_fiscal
    const novoStatus = tarefa.romaneio_url ? 'aguardando_fiscal' : undefined

    const update: any = {
      boleto_url,
      boleto_vencimento,
      boleto_valor,
      boleto_anexado_em: new Date().toISOString(),
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
