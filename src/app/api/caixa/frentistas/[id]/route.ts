import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashSenha } from '@/lib/caixa-auth'

async function checkAuth() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('role')
    .eq('id', user.id)
    .single()
  const roles = ['master', 'adm_financeiro', 'gerente']
  if (!roles.includes(usuario?.role ?? '')) return null
  return { user, role: usuario!.role }
}

// PATCH /api/caixa/frentistas/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await checkAuth()
    if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { id } = await params
    const body = await req.json()
    const admin = createAdminClient()

    const updates: Record<string, any> = { atualizado_em: new Date().toISOString() }
    if (body.nome             !== undefined) updates.nome               = body.nome.trim()
    if (body.codigo           !== undefined) updates.codigo             = body.codigo.trim()
    if (body.codigo_operador_as !== undefined) updates.codigo_operador_as = body.codigo_operador_as?.trim() || null
    if (body.ativo            !== undefined) updates.ativo              = body.ativo
    if (body.senha) updates.senha_hash = hashSenha(body.senha)

    const { data, error } = await admin
      .from('frentistas')
      .update(updates)
      .eq('id', id)
      .select('id, nome, codigo, codigo_operador_as, ativo, posto_id')
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/caixa/frentistas/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await checkAuth()
    if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { id } = await params
    const admin = createAdminClient()

    const { error } = await admin.from('frentistas').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
