import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ROLES = ['master', 'adm_financeiro', 'gerente']

async function autorizar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado', status: 401 as const }
  const { data: u } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
  if (!u || !ROLES.includes(u.role)) return { erro: 'Sem permissão', status: 403 as const }
  return { user }
}

// PUT — atualiza insumo
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autorizar()
  if ('erro' in auth) return NextResponse.json({ error: auth.erro }, { status: auth.status })

  const { id } = await params
  const body = await req.json()

  const update: Record<string, unknown> = {}
  if (body.nome !== undefined)           update.nome = String(body.nome).trim()
  if (body.unidade !== undefined)        update.unidade = body.unidade
  if (body.custo_unitario !== undefined) update.custo_unitario = Number(body.custo_unitario) || 0
  if (body.estoque !== undefined)        update.estoque = Number(body.estoque) || 0
  if (body.ativo !== undefined)          update.ativo = !!body.ativo

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('salgados_insumos')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ insumo: data })
}

// DELETE — remove insumo
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autorizar()
  if ('erro' in auth) return NextResponse.json({ error: auth.erro }, { status: auth.status })

  const { id } = await params
  const admin = createAdminClient()
  const { error } = await admin.from('salgados_insumos').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
