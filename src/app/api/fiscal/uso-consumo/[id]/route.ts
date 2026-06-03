import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// DELETE — remove a marcação de uso e consumo
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    // Apenas master e adm_financeiro podem deletar
    const { data: userData } = await supabase
      .from('usuarios')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!userData || !['master', 'adm_financeiro'].includes(userData.role)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const admin = createAdminClient()

    // Remove a marcação de uso e consumo (marca como false)
    const { data, error } = await admin
      .from('fiscal_tarefas')
      .update({ is_uso_consumo: false })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ sucesso: true, tarefa: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
