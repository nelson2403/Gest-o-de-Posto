import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// GET  /api/comissionamento/checklists/templates/[id]      → detalhe (com itens)
// PATCH /api/comissionamento/checklists/templates/[id]      → edita meta + substitui itens (opcional)
// DELETE /api/comissionamento/checklists/templates/[id]    → só se não houver aplicação usando

interface ItemInput { descricao: string; pontos: number; ordem?: number }

function validarItens(input: unknown): { ok: true; itens: ItemInput[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'itens deve ser um array' }
  const out: ItemInput[] = []
  for (let i = 0; i < input.length; i++) {
    const it = input[i] as Partial<ItemInput>
    if (typeof it?.descricao !== 'string' || it.descricao.trim() === '') {
      return { ok: false, error: `itens[${i}].descricao é obrigatória` }
    }
    const pontos = Number(it?.pontos)
    if (!Number.isFinite(pontos) || pontos <= 0) {
      return { ok: false, error: `itens[${i}].pontos deve ser > 0` }
    }
    out.push({ descricao: it.descricao.trim(), pontos, ordem: Number(it.ordem ?? i) })
  }
  return { ok: true, itens: out }
}

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await ctx.params
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('comissio_checklists_template')
    .select('*, itens:comissio_checklists_itens(id, ordem, descricao, pontos)')
    .eq('id', id)
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'não encontrado' }, { status: 404 })
  return NextResponse.json({ template: data })
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await ctx.params
  const body = await req.json().catch(() => ({})) as Partial<{
    nome: string; descricao: string; ativo: boolean; itens: unknown
  }>

  const admin = createAdminClient()
  const updates: Record<string, unknown> = {}
  if (body.nome      !== undefined) updates.nome      = String(body.nome).trim()
  if (body.descricao !== undefined) updates.descricao = String(body.descricao).trim()
  if (body.ativo     !== undefined) updates.ativo     = !!body.ativo

  if (Object.keys(updates).length > 0) {
    const { error } = await admin.from('comissio_checklists_template').update(updates).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Substituição atômica dos itens: se enviou body.itens, DELETE + INSERT
  // dos novos. Como a tabela de respostas tem FK para itens com ON DELETE
  // CASCADE, respostas antigas serão perdidas — por isso a UI só oferece
  // edição de itens quando o template não tem aplicações.
  if (body.itens !== undefined) {
    const vI = validarItens(body.itens)
    if (!vI.ok) return NextResponse.json({ error: vI.error }, { status: 400 })
    if (vI.itens.length === 0) return NextResponse.json({ error: 'template precisa ter ao menos 1 item' }, { status: 400 })

    // Verifica se já há aplicações; bloqueia edição de itens se sim
    const { count } = await admin
      .from('comissio_checklists_aplicacoes')
      .select('id', { count: 'exact', head: true })
      .eq('template_id', id)
    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: 'Template já tem aplicações — clone o template e edite a cópia para não perder o histórico' }, { status: 409 })
    }

    await admin.from('comissio_checklists_itens').delete().eq('template_id', id)
    const payload = vI.itens.map((it, i) => ({
      template_id: id, ordem: it.ordem ?? i,
      descricao: it.descricao, pontos: it.pontos,
    }))
    const { error: erI } = await admin.from('comissio_checklists_itens').insert(payload)
    if (erI) return NextResponse.json({ error: erI.message }, { status: 500 })
  }

  const { data } = await admin
    .from('comissio_checklists_template')
    .select('*, itens:comissio_checklists_itens(id, ordem, descricao, pontos)')
    .eq('id', id)
    .single()
  return NextResponse.json({ template: data })
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await ctx.params
  const admin = createAdminClient()

  const { count } = await admin
    .from('comissio_checklists_aplicacoes')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', id)
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: 'Template com aplicações — desative em vez de excluir' }, { status: 409 })
  }

  const { error } = await admin.from('comissio_checklists_template').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
