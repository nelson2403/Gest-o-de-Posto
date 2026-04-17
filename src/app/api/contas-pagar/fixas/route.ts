import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const posto_id = searchParams.get('posto_id')

  const admin = createAdminClient()
  let q = admin
    .from('cp_contas_fixas')
    .select('*, postos(nome), cp_fornecedores(nome)')
    .order('categoria')
    .order('descricao')

  if (posto_id) q = q.eq('posto_id', posto_id)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ fixas: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()
  const { posto_id, descricao, categoria, fornecedor_id, fornecedor_nome, valor_estimado, dia_vencimento, obs } = body

  if (!posto_id || !descricao || !categoria || !valor_estimado || !dia_vencimento)
    return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 })

  const admin = createAdminClient()

  // Resolve fornecedor: por id direto, ou por nome (upsert)
  let fid: string | null = fornecedor_id || null
  if (!fid && fornecedor_nome?.trim()) {
    const nome = fornecedor_nome.trim()
    const { data: existing } = await admin
      .from('cp_fornecedores')
      .select('id')
      .ilike('nome', nome)
      .limit(1)
      .single()
    if (existing) {
      fid = existing.id
    } else {
      const { data: novo } = await admin
        .from('cp_fornecedores')
        .insert({ nome })
        .select('id')
        .single()
      fid = novo?.id ?? null
    }
  }

  const { data, error } = await admin
    .from('cp_contas_fixas')
    .insert({
      posto_id, descricao, categoria,
      fornecedor_id: fid,
      valor_estimado: parseFloat(valor_estimado),
      dia_vencimento: parseInt(dia_vencimento),
      obs: obs || null,
      criado_por: user.id,
    })
    .select('*, postos(nome), cp_fornecedores(nome)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ fixa: data })
}
