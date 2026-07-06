import { NextResponse } from 'next/server'
import { exigirRole } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// POST /api/caixa/conciliacao/match — liga uma linha do banco a uma do sistema
export async function POST(req: Request) {
  const auth = await exigirRole(['master'])
  if (!auth.ok) return auth.resp

  const body = await req.json().catch(() => null)
  const { conta_id, posto_id, banco, sistema } = body ?? {}
  if (!conta_id || !banco?.id || !sistema?.id) {
    return NextResponse.json({ error: 'conta_id, banco e sistema são obrigatórios' }, { status: 400 })
  }

  const admin = createAdminClient()
  // Relação 1:1 — remove qualquer vínculo anterior de qualquer um dos lados.
  await admin.from('conciliacao_manual').delete().eq('conta_bancaria_id', conta_id).eq('banco_hash', banco.id)
  await admin.from('conciliacao_manual').delete().eq('conta_bancaria_id', conta_id).eq('as_grid', sistema.id)

  const { error } = await admin.from('conciliacao_manual').insert({
    conta_bancaria_id: conta_id,
    posto_id:          posto_id ?? null,
    banco_hash:        banco.id,
    banco_data:        banco.data ?? null,
    banco_valor:       banco.valor ?? null,
    banco_descricao:   banco.descricao ?? null,
    as_grid:           sistema.id,
    as_data:           sistema.data ?? null,
    as_valor:          sistema.valor ?? null,
    as_descricao:      sistema.descricao ?? null,
    conciliado_por:    auth.user.id,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}

// DELETE /api/caixa/conciliacao/match — desfaz o vínculo (por banco_hash ou as_grid)
export async function DELETE(req: Request) {
  const auth = await exigirRole(['master'])
  if (!auth.ok) return auth.resp

  const body = await req.json().catch(() => null)
  const { conta_id, banco_hash, as_grid } = body ?? {}
  if (!conta_id || (!banco_hash && !as_grid)) {
    return NextResponse.json({ error: 'conta_id e banco_hash ou as_grid são obrigatórios' }, { status: 400 })
  }
  const admin = createAdminClient()
  let q = admin.from('conciliacao_manual').delete().eq('conta_bancaria_id', conta_id)
  q = banco_hash ? q.eq('banco_hash', banco_hash) : q.eq('as_grid', as_grid)
  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
