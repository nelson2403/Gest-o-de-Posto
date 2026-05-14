import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const setor  = url.searchParams.get('setor')
  const status = url.searchParams.get('status')

  let q = supabase
    .from('solicitacoes_pagamento')
    .select('*')
    .order('criado_em', { ascending: false })

  if (setor)  q = q.eq('setor', setor)
  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ solicitacoes: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, nome, empresa_id, role')
    .eq('id', user.id)
    .single()

  if (!usuario) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

  const body = await req.json()

  const { data, error } = await supabase
    .from('solicitacoes_pagamento')
    .insert({
      empresa_id:      usuario.empresa_id,
      setor:           body.setor,
      titulo:          body.titulo,
      descricao:       body.descricao || null,
      fornecedor:      body.fornecedor || null,
      valor:           body.valor ? Number(body.valor) : null,
      data_vencimento: body.data_vencimento || null,
      observacoes:     body.observacoes || null,
      criado_por_id:   usuario.id,
      criado_por_nome: usuario.nome,
      status:          'pendente',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ solicitacao: data })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()
  const { id, status, motivo_rejeicao } = body

  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })

  const { data, error } = await supabase
    .from('solicitacoes_pagamento')
    .update({ status, motivo_rejeicao: motivo_rejeicao || null, atualizado_em: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ solicitacao: data })
}
