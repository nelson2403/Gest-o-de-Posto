import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface MetaGrupo {
  id:             string
  posto_id:       string
  parent_id:      string | null
  nome:           string
  period_start:   string | null
  period_end:     string | null
  sort_order:     number
  criado_em:      string
  atualizado_em:  string
}

// ─── GET — lista grupos de meta (filtro opcional por posto_id) ──────────────
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const postoId = new URL(req.url).searchParams.get('posto_id')

  const admin = createAdminClient()
  let q = admin
    .from('comissio_metas_grupos')
    .select('*')
    .order('sort_order')
    .order('nome')
  if (postoId) q = q.eq('posto_id', postoId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ grupos: (data ?? []) as MetaGrupo[] })
}

// ─── POST — cria grupo ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Partial<{
    posto_id:      string
    parent_id:     string | null
    nome:          string
    period_start:  string | null
    period_end:    string | null
    sort_order:    number
  }>

  if (!body.posto_id) return NextResponse.json({ error: 'posto_id é obrigatório' }, { status: 400 })
  if (!body.nome?.trim()) return NextResponse.json({ error: 'nome é obrigatório' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('comissio_metas_grupos')
    .insert({
      posto_id:      body.posto_id,
      parent_id:     body.parent_id ?? null,
      nome:          body.nome.trim(),
      period_start:  body.period_start ?? null,
      period_end:    body.period_end ?? null,
      sort_order:    body.sort_order  ?? 0,
      criado_por:    user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ grupo: data })
}
