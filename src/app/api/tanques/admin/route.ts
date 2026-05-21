import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function checkMaster() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data: u } = await admin.from('usuarios').select('role').eq('id', user.id).single()
  if (!u || u.role !== 'master') return null
  return { user, admin }
}

// GET — lista postos + tanques existentes
export async function GET() {
  const ctx = await checkMaster()
  if (!ctx) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { admin } = ctx

  const [{ data: postos }, { data: tanques }] = await Promise.all([
    admin.from('postos').select('id, nome').order('nome'),
    admin.from('tanques_postos').select('id, posto_id, posto_nome, produto, capacidade_litros, bandeira, ordem, ativo').order('posto_nome').order('ordem'),
  ])

  return NextResponse.json({ postos: postos ?? [], tanques: tanques ?? [] })
}

// POST — cria novo tanque
export async function POST(req: NextRequest) {
  const ctx = await checkMaster()
  if (!ctx) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { admin } = ctx

  const body = await req.json()
  const { posto_id, posto_nome, produto, capacidade_litros, bandeira, ordem } = body

  if (!posto_id || !posto_nome || !produto || !capacidade_litros) {
    return NextResponse.json({ error: 'Preencha posto, produto e capacidade' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('tanques_postos')
    .insert({ posto_id, posto_nome, produto, capacidade_litros: Number(capacidade_litros), bandeira: bandeira || 'BR', ordem: Number(ordem) || 1, ativo: true })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tanque: data })
}

// PATCH — atualiza ou desativa tanque
export async function PATCH(req: NextRequest) {
  const ctx = await checkMaster()
  if (!ctx) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { admin } = ctx

  const body = await req.json()
  const { id, ...fields } = body

  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })

  const { data, error } = await admin
    .from('tanques_postos')
    .update(fields)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tanque: data })
}
