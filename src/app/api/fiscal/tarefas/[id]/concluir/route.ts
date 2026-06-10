import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ROLES = ['master', 'adm_fiscal', 'adm_financeiro']

// PATCH — fiscal conclui manualmente uma tarefa em aguardando_fiscal
// (usado quando o lançamento no AUTOSYSTEM não foi vinculado à NFe e o sync
//  automático não conseguiu casar — fiscal confirma que já lançou)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { data: u } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
    if (!u || !ROLES.includes(u.role)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const admin = createAdminClient()
    const { data: tarefa } = await admin
      .from('fiscal_tarefas')
      .select('status, boleto_url, boletos')
      .eq('id', id)
      .single()

    if (!tarefa) return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })
    if (tarefa.status === 'concluida') return NextResponse.json({ ok: true, ja: true })
    if (tarefa.status !== 'aguardando_fiscal') {
      return NextResponse.json({ error: 'Só é possível concluir manualmente tarefas em "Aguardando Fiscal"' }, { status: 400 })
    }

    const agora = new Date().toISOString()
    const temBoleto = (Array.isArray(tarefa.boletos) && tarefa.boletos.some((b: any) => b?.url)) || !!tarefa.boleto_url

    const { data, error } = await admin
      .from('fiscal_tarefas')
      .update({
        status:        'concluida',
        lancado_em:    agora,
        concluida_em:  agora,
        atualizada_em: agora,
        ...(temBoleto ? { boleto_status: 'pendente' } : {}),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ tarefa: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
