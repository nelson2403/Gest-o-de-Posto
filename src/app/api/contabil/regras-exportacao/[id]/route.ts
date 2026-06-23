import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface Ctx { params: Promise<{ id: string }> }

const CAMPOS_COND  = ['conta_debitar','conta_creditar','observacao','documento','pessoa']
const OPERADORES   = ['starts_with','not_starts_with','equals','not_equals','contains','not_contains']
const CAMPOS_ACAO  = ['conta_debitar','conta_creditar','observacao']

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))

  const patch: Record<string, unknown> = {}
  if (typeof body.nome === 'string')       patch.nome      = body.nome.trim()
  if (typeof body.descricao === 'string')  patch.descricao = body.descricao.trim()
  if (typeof body.ativa === 'boolean')     patch.ativa     = body.ativa
  if (Number.isFinite(Number(body.ordem))) patch.ordem     = Number(body.ordem)
  if (typeof body.condicao_campo    === 'string' && CAMPOS_COND.includes(body.condicao_campo))      patch.condicao_campo    = body.condicao_campo
  if (typeof body.condicao_operador === 'string' && OPERADORES.includes(body.condicao_operador))    patch.condicao_operador = body.condicao_operador
  if (typeof body.condicao_valor    === 'string' && body.condicao_valor.length > 0)                 patch.condicao_valor    = body.condicao_valor
  if (typeof body.acao_campo        === 'string' && CAMPOS_ACAO.includes(body.acao_campo))          patch.acao_campo        = body.acao_campo
  if (typeof body.acao_valor        === 'string' && body.acao_valor.trim().length > 0)              patch.acao_valor        = body.acao_valor.trim()

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nada a atualizar' }, { status: 400 })

  const { data, error } = await supabase
    .from('contabil_regras_exportacao')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ regra: data })
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await ctx.params
  const { error } = await supabase
    .from('contabil_regras_exportacao')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
