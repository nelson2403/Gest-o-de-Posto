import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET /api/contabil/mapeamento-contas
//   ?search=...   (filtra por conta_autosystem / conta_contabil / descricao — opcional)
//   ?ativo=1|0    (opcional)
//
// POST /api/contabil/mapeamento-contas
//   body: { conta_autosystem, conta_contabil, descricao?, ativo? }
//
// A UNIQUE em conta_autosystem garante 1 mapeamento por conta de origem.

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const sp     = new URL(req.url).searchParams
  const search = (sp.get('search') ?? '').trim()
  const ativo  = sp.get('ativo')

  let q = supabase
    .from('contabil_mapeamento_contas')
    .select('*')
    .order('conta_autosystem', { ascending: true })

  if (ativo === '1') q = q.eq('ativo', true)
  if (ativo === '0') q = q.eq('ativo', false)
  if (search) {
    // ilike OR em 3 colunas
    q = q.or(
      `conta_autosystem.ilike.%${search}%,conta_contabil.ilike.%${search}%,descricao.ilike.%${search}%`,
    )
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ mapeamentos: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const conta_autosystem = String(body.conta_autosystem ?? '').trim()
  const conta_contabil   = String(body.conta_contabil   ?? '').trim()
  const descricao        = String(body.descricao        ?? '').trim()
  const ativo            = body.ativo === undefined ? true : Boolean(body.ativo)

  if (!conta_autosystem) return NextResponse.json({ error: 'conta_autosystem é obrigatório' }, { status: 400 })
  if (!conta_contabil)   return NextResponse.json({ error: 'conta_contabil é obrigatório' },   { status: 400 })

  const { data, error } = await supabase
    .from('contabil_mapeamento_contas')
    .insert({
      conta_autosystem,
      conta_contabil,
      descricao,
      ativo,
      criado_por: user.id,
    })
    .select()
    .single()

  if (error) {
    // 23505 = unique_violation (conta_autosystem já mapeada)
    const msg = error.code === '23505'
      ? `Já existe um mapeamento para a conta ${conta_autosystem}`
      : error.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  return NextResponse.json({ mapeamento: data })
}
