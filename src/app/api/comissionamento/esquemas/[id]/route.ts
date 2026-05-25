import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { EsquemaStatus } from '../route'

const STATUS_VALIDOS: readonly EsquemaStatus[] = ['rascunho', 'ativo', 'inativo']

// ─── GET — esquema + suas regras ─────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const [esq, reg] = await Promise.all([
    admin.from('comissio_esquemas').select('*').eq('id', id).single(),
    admin.from('comissio_regras').select('*').eq('esquema_id', id).order('prioridade', { ascending: true }).order('criado_em', { ascending: true }),
  ])

  if (esq.error || !esq.data) {
    return NextResponse.json({ error: esq.error?.message ?? 'Esquema não encontrado' }, { status: 404 })
  }
  return NextResponse.json({ esquema: esq.data, regras: reg.data ?? [] })
}

// ─── PATCH — atualiza esquema ────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Partial<{
    nome: string; descricao: string; status: EsquemaStatus
  }>

  if (body.status && !STATUS_VALIDOS.includes(body.status)) {
    return NextResponse.json({ error: `status inválido — use ${STATUS_VALIDOS.join(', ')}` }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (body.nome      !== undefined) updates.nome      = body.nome.trim()
  if (body.descricao !== undefined) updates.descricao = body.descricao.trim()
  if (body.status    !== undefined) updates.status    = body.status

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('comissio_esquemas')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ esquema: data })
}

// ─── DELETE ──────────────────────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { error } = await admin.from('comissio_esquemas').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
