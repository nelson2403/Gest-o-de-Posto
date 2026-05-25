import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const url      = new URL(req.url)
  const setor    = url.searchParams.get('setor')
  const status   = url.searchParams.get('status')
  const tarefa_id = url.searchParams.get('tarefa_id')

  let q = supabase
    .from('solicitacoes_pagamento')
    .select('*')
    .order('criado_em', { ascending: false })

  if (setor)     q = q.eq('setor', setor)
  if (status)    q = q.eq('status', status)
  if (tarefa_id) q = q.ilike('descricao', `%Tarefa: ${tarefa_id}%`)

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
      arquivo_url:     body.arquivo_url  || null,
      arquivo_nome:    body.arquivo_nome || null,
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
  const { id, status, motivo_rejeicao, arquivo_url, arquivo_nome, valor, data_vencimento } = body

  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })

  const campos: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  if (status          !== undefined) campos.status          = status
  if (motivo_rejeicao !== undefined) campos.motivo_rejeicao = motivo_rejeicao || null
  if (arquivo_url     !== undefined) campos.arquivo_url     = arquivo_url     || null
  if (arquivo_nome    !== undefined) campos.arquivo_nome    = arquivo_nome    || null
  if (valor           !== undefined) campos.valor           = valor           ? Number(valor) : null
  if (data_vencimento !== undefined) campos.data_vencimento = data_vencimento || null

  const { data, error } = await supabase
    .from('solicitacoes_pagamento')
    .update(campos)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ solicitacao: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('role')
    .eq('id', user.id)
    .single()

  if (usuario?.role !== 'master') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const url = new URL(req.url)
  const id  = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('solicitacoes_pagamento')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
