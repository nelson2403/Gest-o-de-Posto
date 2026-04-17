import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const data = searchParams.get('data')
  const posto_id = searchParams.get('posto_id')

  const admin = createAdminClient()
  let q = admin
    .from('cp_lancamentos')
    .select('*, postos(nome), cp_fornecedores(nome), criado_por_usuario:usuarios!cp_lancamentos_criado_por_fkey(nome)')
    .order('criado_em', { ascending: false })

  if (data)     q = q.eq('data_lancamento', data)
  if (posto_id) q = q.eq('posto_id', posto_id)

  const { data: result, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lancamentos: result ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()
  const { posto_id, data_lancamento, descricao, valor, fornecedor_id, fornecedor_nome, documento, obs } = body

  if (!posto_id || !data_lancamento || !descricao || !valor)
    return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 })

  const admin = createAdminClient()
  const { data: result, error } = await admin
    .from('cp_lancamentos')
    .insert({
      posto_id, data_lancamento, descricao,
      valor: parseFloat(valor),
      fornecedor_id: fornecedor_id || null,
      fornecedor_nome: fornecedor_nome || null,
      documento: documento || null,
      obs: obs || null,
      criado_por: user.id,
    })
    .select('*, postos(nome), cp_fornecedores(nome)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lancamento: result })
}
