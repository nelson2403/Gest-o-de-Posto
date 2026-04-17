import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('cp_fornecedores')
    .select('*')
    .order('nome')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ fornecedores: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()
  const { nome, cnpj, categoria } = body
  if (!nome) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('cp_fornecedores')
    .insert({ nome, cnpj: cnpj || null, categoria: categoria || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ fornecedor: data })
}
