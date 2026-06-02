import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ id: string }> }

// POST — vincula um posto ao portal
export async function POST(req: NextRequest, { params }: Params) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id: portal_id } = await params
  const { posto_id } = await req.json()
  if (!posto_id) return NextResponse.json({ error: 'posto_id obrigatório' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('portais_frotas_postos')
    .upsert({ portal_id, posto_id }, { onConflict: 'portal_id,posto_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — desvincula um posto do portal
export async function DELETE(req: NextRequest, { params }: Params) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id: portal_id } = await params
  const { posto_id } = await req.json()

  const admin = createAdminClient()
  const { error } = await admin
    .from('portais_frotas_postos')
    .delete()
    .eq('portal_id', portal_id)
    .eq('posto_id', posto_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
