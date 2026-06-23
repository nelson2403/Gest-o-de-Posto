import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// PATCH /api/contabil/mapeamento-contas/[id]
//   body: { conta_autosystem?, conta_contabil?, descricao?, ativo? }
//
// DELETE /api/contabil/mapeamento-contas/[id]

interface Ctx { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))

  const patch: Record<string, unknown> = {}
  if (typeof body.conta_autosystem === 'string') patch.conta_autosystem = body.conta_autosystem.trim()
  if (typeof body.conta_contabil   === 'string') patch.conta_contabil   = body.conta_contabil.trim()
  if (typeof body.descricao        === 'string') patch.descricao        = body.descricao.trim()
  if (typeof body.ativo === 'boolean')           patch.ativo            = body.ativo

  if (patch.conta_autosystem === '') return NextResponse.json({ error: 'conta_autosystem não pode ser vazio' }, { status: 400 })
  if (patch.conta_contabil   === '') return NextResponse.json({ error: 'conta_contabil não pode ser vazio' },   { status: 400 })
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nada a atualizar' }, { status: 400 })

  const { data, error } = await supabase
    .from('contabil_mapeamento_contas')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    const msg = error.code === '23505'
      ? `Já existe um mapeamento para a conta ${patch.conta_autosystem}`
      : error.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  return NextResponse.json({ mapeamento: data })
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await ctx.params
  const { error } = await supabase
    .from('contabil_mapeamento_contas')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
