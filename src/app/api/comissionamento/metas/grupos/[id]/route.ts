import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── PATCH — atualiza grupo ─────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Partial<{
    parent_id:     string | null
    nome:          string
    period_start:  string | null
    period_end:    string | null
    sort_order:    number
  }>

  const updates: Record<string, unknown> = {}
  if (body.parent_id !== undefined)    updates.parent_id    = body.parent_id
  if (body.nome !== undefined) {
    if (!body.nome.trim()) return NextResponse.json({ error: 'nome não pode ser vazio' }, { status: 400 })
    updates.nome = body.nome.trim()
  }
  if (body.period_start !== undefined) updates.period_start = body.period_start
  if (body.period_end !== undefined)   updates.period_end   = body.period_end
  if (body.sort_order !== undefined)   updates.sort_order   = body.sort_order

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'nenhum campo para atualizar' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('comissio_metas_grupos')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 })
  return NextResponse.json({ grupo: data })
}

// ─── DELETE — remove grupo (cascade nos filhos) ─────────────────────────────
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { error } = await admin.from('comissio_metas_grupos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
