import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ROLES = ['master', 'adm_financeiro', 'gerente']

async function autorizar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado', status: 401 as const }
  const { data: u } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
  if (!u || !ROLES.includes(u.role)) return { erro: 'Sem permissão', status: 403 as const }
  return { user }
}

// Recalcula o custo do salgado a partir da ficha técnica
async function recalcularCusto(admin: ReturnType<typeof createAdminClient>, salgadoId: string) {
  const { data: ficha } = await admin
    .from('salgados_ficha')
    .select('quantidade, insumo:salgados_insumos(custo_unitario)')
    .eq('salgado_id', salgadoId)

  const custo = (ficha ?? []).reduce(
    (s, f: any) => s + Number(f.quantidade || 0) * Number(f.insumo?.custo_unitario || 0), 0,
  )
  await admin.from('salgados').update({ custo: parseFloat(custo.toFixed(2)) }).eq('id', salgadoId)
  return parseFloat(custo.toFixed(2))
}

// GET — ficha técnica do salgado (insumos + quantidades)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autorizar()
  if ('erro' in auth) return NextResponse.json({ error: auth.erro }, { status: auth.status })

  const { id } = await params
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('salgados_ficha')
    .select('id, insumo_id, quantidade, insumo:salgados_insumos(id, nome, unidade, custo_unitario)')
    .eq('salgado_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ficha: data ?? [] })
}

// PUT — substitui a ficha técnica e recalcula o custo
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autorizar()
  if ('erro' in auth) return NextResponse.json({ error: auth.erro }, { status: auth.status })

  const { id } = await params
  const body = await req.json() as { itens: { insumo_id: string; quantidade: number }[] }
  const admin = createAdminClient()

  await admin.from('salgados_ficha').delete().eq('salgado_id', id)

  const itens = (body.itens ?? []).filter(i => i.insumo_id && Number(i.quantidade) > 0)
  if (itens.length) {
    const { error } = await admin.from('salgados_ficha').insert(
      itens.map(i => ({ salgado_id: id, insumo_id: i.insumo_id, quantidade: Number(i.quantidade) })),
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const custo = await recalcularCusto(admin, id)
  return NextResponse.json({ ok: true, custo })
}
