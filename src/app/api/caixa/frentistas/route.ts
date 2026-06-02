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

// GET /api/caixa/frentistas?posto_id=...
export async function GET(req: NextRequest) {
  try {
    const auth = await checkAuth()
    if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const posto_id = new URL(req.url).searchParams.get('posto_id')
    const admin = createAdminClient()

    let query = admin
      .from('frentistas')
      .select('id, nome, codigo, codigo_operador_as, ativo, posto_id, criado_em')
      .order('nome')

    if (posto_id) query = query.eq('posto_id', posto_id)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/caixa/frentistas — cria novo frentista
export async function POST(req: NextRequest) {
  try {
    const auth = await checkAuth()
    if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { posto_id, nome, codigo, codigo_operador_as } = await req.json()
    if (!posto_id || !nome?.trim() || !codigo?.trim()) {
      return NextResponse.json({ error: 'posto_id, nome e codigo obrigatórios' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('frentistas')
      .insert({
        posto_id,
        nome:               nome.trim(),
        codigo:             codigo.trim(),
        senha_hash:         'autosystem',   // auth é via AUTOSYSTEM — placeholder
        codigo_operador_as: codigo_operador_as?.trim() || null,
        ativo:              true,
      })
      .select('id, nome, codigo, codigo_operador_as, ativo, posto_id')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Código já existe neste posto' }, { status: 409 })
      }
      throw error
    }
    return NextResponse.json(data, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
