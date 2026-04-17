import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()
  const admin = createAdminClient()

  // Resolve fornecedor por nome se fornecedor_id não for enviado
  if (body.fornecedor_nome !== undefined && body.fornecedor_id === undefined) {
    const nome = body.fornecedor_nome?.trim()
    if (nome) {
      const { data: existing } = await admin
        .from('cp_fornecedores').select('id').ilike('nome', nome).limit(1).single()
      if (existing) {
        body.fornecedor_id = existing.id
      } else {
        const { data: novo } = await admin
          .from('cp_fornecedores').insert({ nome }).select('id').single()
        body.fornecedor_id = novo?.id ?? null
      }
    } else {
      body.fornecedor_id = null
    }
  }

  const payload: any = {}
  if (body.descricao !== undefined)      payload.descricao       = body.descricao
  if (body.categoria !== undefined)      payload.categoria       = body.categoria
  if (body.fornecedor_id !== undefined)  payload.fornecedor_id   = body.fornecedor_id || null
  if (body.valor_estimado !== undefined) payload.valor_estimado  = parseFloat(body.valor_estimado)
  if (body.dia_vencimento !== undefined) payload.dia_vencimento  = parseInt(body.dia_vencimento)
  if (body.ativo !== undefined)          payload.ativo           = body.ativo
  if (body.obs !== undefined)            payload.obs             = body.obs || null

  const { data, error } = await admin
    .from('cp_contas_fixas')
    .update(payload)
    .eq('id', id)
    .select('*, postos(nome), cp_fornecedores(nome)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ fixa: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { error } = await admin.from('cp_contas_fixas').update({ ativo: false }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
