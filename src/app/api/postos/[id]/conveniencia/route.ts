import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// PATCH /api/postos/[id]/conveniencia  { conveniencia: boolean }
// Marca/desmarca um posto como loja de conveniência (sem combustível). Só master/adm.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { data: usuario } = await supabase
      .from('usuarios').select('role').eq('id', user.id).single()
    if (!usuario || !['master', 'adm_financeiro'].includes(usuario.role ?? '')) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { conveniencia } = await req.json() as { conveniencia?: boolean }

    const admin = createAdminClient()
    const { error } = await admin
      .from('postos')
      .update({ conveniencia: !!conveniencia })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, conveniencia: !!conveniencia })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
