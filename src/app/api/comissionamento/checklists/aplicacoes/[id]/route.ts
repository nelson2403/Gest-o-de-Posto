import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// GET    /api/comissionamento/checklists/aplicacoes/[id]
// PATCH  /api/comissionamento/checklists/aplicacoes/[id]
//   Aceita: observacoes, period_start, period_end e um array `respostas`
//   com {item_id, ok, motivo}. Faz UPSERT das respostas — o trigger no
//   BD recalcula o total_pontos automaticamente.
// DELETE /api/comissionamento/checklists/aplicacoes/[id]

interface RespostaInput { item_id: string; ok: boolean; motivo?: string }
interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await ctx.params
  const admin = createAdminClient()

  const { data: aplic, error: erA } = await admin
    .from('comissio_checklists_aplicacoes')
    .select('*')
    .eq('id', id)
    .single()
  if (erA || !aplic) return NextResponse.json({ error: 'não encontrada' }, { status: 404 })

  const { data: template, error: erT } = await admin
    .from('comissio_checklists_template')
    .select('id, nome, descricao, ativo, itens:comissio_checklists_itens(id, ordem, descricao, pontos)')
    .eq('id', aplic.template_id)
    .single()
  if (erT || !template) return NextResponse.json({ error: 'template não encontrado' }, { status: 500 })

  const { data: respostas } = await admin
    .from('comissio_checklists_respostas')
    .select('aplicacao_id, item_id, ok, motivo')
    .eq('aplicacao_id', id)

  return NextResponse.json({ aplicacao: aplic, template, respostas: respostas ?? [] })
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await ctx.params
  const body = await req.json().catch(() => ({})) as Partial<{
    observacoes:  string
    period_start: string
    period_end:   string
    respostas:    RespostaInput[]
  }>

  const admin = createAdminClient()
  const updates: Record<string, unknown> = {}
  if (body.observacoes  !== undefined) updates.observacoes  = String(body.observacoes)
  if (body.period_start !== undefined) updates.period_start = body.period_start
  if (body.period_end   !== undefined) updates.period_end   = body.period_end
  if (Object.keys(updates).length > 0) {
    const { error } = await admin
      .from('comissio_checklists_aplicacoes')
      .update(updates)
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (Array.isArray(body.respostas)) {
    const payload = body.respostas.map(r => ({
      aplicacao_id: id,
      item_id:      r.item_id,
      ok:           !!r.ok,
      motivo:       String(r.motivo ?? ''),
    }))
    const { error } = await admin
      .from('comissio_checklists_respostas')
      .upsert(payload, { onConflict: 'aplicacao_id,item_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data } = await admin
    .from('comissio_checklists_aplicacoes')
    .select('*')
    .eq('id', id)
    .single()
  return NextResponse.json({ aplicacao: data })
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await ctx.params
  const admin = createAdminClient()
  const { error } = await admin.from('comissio_checklists_aplicacoes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
