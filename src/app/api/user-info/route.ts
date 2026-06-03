import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: userData } = await supabase
    .from('usuarios')
    .select('role, id')
    .eq('id', user.id)
    .single()

  return NextResponse.json({
    id: user.id,
    role: userData?.role ?? null,
  })
}
