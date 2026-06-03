import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// PATCH — marca divergência como concluída
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { data: userData } = await supabase
      .from('usuarios')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!userData || !['operador_conciliador', 'adm_financeiro', 'master'].includes(userData.role)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const admin = createAdminClient()

    // Marcar tarefa como concluída
    const { data, error } = await admin
      .from('tarefas')
      .update({
        status: 'concluida',
        atualizada_em: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('categoria', 'conciliacao_bancaria')
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ tarefa: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
