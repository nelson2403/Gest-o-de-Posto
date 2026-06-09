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

// GET — lista insumos (matérias-primas)
export async function GET() {
  const auth = await autorizar()
  if ('erro' in auth) return NextResponse.json({ error: auth.erro }, { status: auth.status })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('salgados_insumos')
    .select('id, nome, unidade, custo_unitario, estoque, ativo')
    .order('nome')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ insumos: data ?? [] })
}

// POST — cria insumo
export async function POST(req: NextRequest) {
  const auth = await autorizar()
  if ('erro' in auth) return NextResponse.json({ error: auth.erro }, { status: auth.status })

  const body = await req.json()
  if (!body.nome?.trim()) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('salgados_insumos')
    .insert({
      nome:           body.nome.trim(),
      unidade:        body.unidade ?? 'kg',
      custo_unitario: Number(body.custo_unitario) || 0,
      estoque:        Number(body.estoque) || 0,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ insumo: data })
}
