import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type ComissioRole = 'supervisor' | 'manager' | 'pit_boss' | 'oil_changer' | 'seller'

export interface ComissioMembro {
  id:                  string
  posto_id:            string
  posto_nome:          string
  external_person_id:  string | null
  nome:                string
  email:               string | null
  role:                ComissioRole
  ativo:               boolean
  criado_em:           string
  atualizado_em:       string
}

const ROLES_VALIDAS: readonly ComissioRole[] = ['supervisor', 'manager', 'pit_boss', 'oil_changer', 'seller']

// ─── GET — lista membros (filtro opcional por posto_id) ──────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const postoId = new URL(req.url).searchParams.get('posto_id')

  const admin = createAdminClient()
  let q = admin
    .from('comissio_membros')
    .select(`id, posto_id, external_person_id, nome, email, role, ativo,
             criado_em, atualizado_em, postos:posto_id (nome)`)
    .order('nome')
  if (postoId) q = q.eq('posto_id', postoId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const membros: ComissioMembro[] = (data ?? []).map((r: any) => ({
    id:                 r.id,
    posto_id:           r.posto_id,
    posto_nome:         r.postos?.nome ?? '',
    external_person_id: r.external_person_id,
    nome:               r.nome,
    email:              r.email,
    role:               r.role,
    ativo:              r.ativo,
    criado_em:          r.criado_em,
    atualizado_em:      r.atualizado_em,
  }))

  return NextResponse.json({ membros })
}

// ─── POST — adiciona membro ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Partial<{
    posto_id:           string
    external_person_id: string | null
    nome:               string
    email:              string | null
    role:               ComissioRole
  }>

  const { posto_id, external_person_id, nome, email, role } = body

  if (!posto_id || !nome || !role) {
    return NextResponse.json({ error: 'posto_id, nome e role são obrigatórios' }, { status: 400 })
  }
  if (!ROLES_VALIDAS.includes(role)) {
    return NextResponse.json({ error: `role inválida — use ${ROLES_VALIDAS.join(', ')}` }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('comissio_membros')
    .insert({
      posto_id,
      external_person_id: external_person_id || null,
      nome:               nome.trim(),
      email:              email?.trim() || null,
      role,
      criado_por:         user.id,
    })
    .select()
    .single()

  if (error) {
    // 23505 = unique_violation (já cadastrado nesse posto)
    if ((error as any).code === '23505') {
      return NextResponse.json({ error: 'Essa pessoa já é membro deste posto' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ membro: data })
}
