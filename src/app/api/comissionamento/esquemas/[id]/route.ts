import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { EsquemaStatus } from '../route'

export type ProductFilterTipo = 'produto' | 'grupo_produto' | 'subgrupo_produto' | 'produto_tipo'
export type ProductFilterModo = 'incluir' | 'excluir'

export interface ProductFilter {
  tipo:    ProductFilterTipo
  valores: string[]
  modo:    ProductFilterModo
}

const STATUS_VALIDOS: readonly EsquemaStatus[]            = ['rascunho', 'ativo', 'inativo']
const PF_TIPOS:       readonly ProductFilterTipo[]        = ['produto','grupo_produto','subgrupo_produto','produto_tipo']
const PF_MODOS:       readonly ProductFilterModo[]        = ['incluir','excluir']

function validarProductFilters(input: unknown): { ok: true; value: ProductFilter[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'product_filters deve ser um array' }
  const out: ProductFilter[] = []
  for (let i = 0; i < input.length; i++) {
    const f = input[i] as Partial<ProductFilter>
    if (!f.tipo || !PF_TIPOS.includes(f.tipo as ProductFilterTipo)) {
      return { ok: false, error: `product_filters[${i}].tipo inválido — use ${PF_TIPOS.join(', ')}` }
    }
    if (!Array.isArray(f.valores)) {
      return { ok: false, error: `product_filters[${i}].valores deve ser um array` }
    }
    if (f.modo && !PF_MODOS.includes(f.modo as ProductFilterModo)) {
      return { ok: false, error: `product_filters[${i}].modo inválido — use ${PF_MODOS.join(', ')}` }
    }
    out.push({
      tipo:    f.tipo as ProductFilterTipo,
      valores: f.valores.map(v => String(v)),
      modo:    (f.modo as ProductFilterModo) ?? 'incluir',
    })
  }
  return { ok: true, value: out }
}

// ─── GET — esquema + suas regras ─────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const [esq, reg, postos] = await Promise.all([
    admin.from('comissio_esquemas').select('*').eq('id', id).single(),
    admin.from('comissio_regras').select('*').eq('esquema_id', id).order('prioridade', { ascending: true }).order('criado_em', { ascending: true }),
    admin.from('comissio_esquema_postos').select('posto_id').eq('esquema_id', id),
  ])

  if (esq.error || !esq.data) {
    return NextResponse.json({ error: esq.error?.message ?? 'Esquema não encontrado' }, { status: 404 })
  }
  return NextResponse.json({
    esquema:    esq.data,
    regras:     reg.data ?? [],
    posto_ids:  (postos.data ?? []).map((p: any) => p.posto_id as string),
  })
}

// ─── PATCH — atualiza esquema ────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Partial<{
    nome: string; descricao: string; status: EsquemaStatus
    product_filters: unknown
  }>

  if (body.status && !STATUS_VALIDOS.includes(body.status)) {
    return NextResponse.json({ error: `status inválido — use ${STATUS_VALIDOS.join(', ')}` }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (body.nome      !== undefined) updates.nome      = body.nome.trim()
  if (body.descricao !== undefined) updates.descricao = body.descricao.trim()
  if (body.status    !== undefined) updates.status    = body.status
  if (body.product_filters !== undefined) {
    const v = validarProductFilters(body.product_filters)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    updates.product_filters = v.value
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('comissio_esquemas')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ esquema: data })
}

// ─── DELETE ──────────────────────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { error } = await admin.from('comissio_esquemas').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
