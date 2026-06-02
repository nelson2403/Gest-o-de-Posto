import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

// PATCH — fiscal rejeita a NF do gerente: volta para nf_rejeitada com motivo
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const { motivo } = await req.json()
    if (!motivo?.trim()) {
      return NextResponse.json({ error: 'Informe o motivo da recusa' }, { status: 400 })
    }

    const { data: tarefa, error: errTarefa } = await supabase
      .from('fiscal_tarefas')
      .select('status')
      .eq('id', id)
      .single()

    if (errTarefa || !tarefa) {
      return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })
    }
    if (tarefa.status !== 'aguardando_fiscal') {
      return NextResponse.json({ error: 'Tarefa não está aguardando fiscal' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('fiscal_tarefas')
      .update({
        status:                  'nf_rejeitada',
        motivo_rejeicao_fiscal:  motivo.trim(),
        atualizada_em:           new Date().toISOString(),
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
