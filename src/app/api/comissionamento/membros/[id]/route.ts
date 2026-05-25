import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ComissioRole } from '../route'

const ROLES_VALIDAS: readonly ComissioRole[] = ['supervisor', 'manager', 'pit_boss', 'oil_changer', 'seller']

// ─── PATCH — atualiza role / posto / ativo / nome / email ────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Partial<{
    role:      ComissioRole
    posto_id:  string
    ativo:     boolean
    nome:      string
    email:     string | null
  }>

  if (body.role && !ROLES_VALIDAS.includes(body.role)) {
    return NextResponse.json({ error: `role inválida — use ${ROLES_VALIDAS.join(', ')}` }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (body.role     !== undefined) updates.role     = body.role
  if (body.posto_id !== undefined) updates.posto_id = body.posto_id
  if (body.ativo    !== undefined) updates.ativo    = body.ativo
  if (body.nome     !== undefined) updates.nome     = body.nome.trim()
  if (body.email    !== undefined) updates.email    = body.email?.trim() || null

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('comissio_membros')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if ((error as any).code === '23505') {
      return NextResponse.json({ error: 'Essa pessoa já é membro deste posto' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ membro: data })
}

// ─── DELETE ──────────────────────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { error } = await admin.from('comissio_membros').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
