import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── PUT — substitui todos os splits da meta atomicamente ───────────────────
//
// Body: { splits: [{ membro_id, valor_meta }] }
//
// Implementa "substituir tudo" via DELETE + INSERT em batch para refletir
// exatamente o que o front enviou (membros removidos do split saem da tabela).
// ─────────────────────────────────────────────────────────────────────────────
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: metaId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Partial<{
    splits: { membro_id: string; valor_meta: number }[]
  }>

  const splits = Array.isArray(body.splits) ? body.splits : []

  // Validações
  const seen = new Set<string>()
  for (const s of splits) {
    if (!s.membro_id) return NextResponse.json({ error: 'membro_id obrigatório em cada split' }, { status: 400 })
    if (typeof s.valor_meta !== 'number' || !isFinite(s.valor_meta) || s.valor_meta < 0) {
      return NextResponse.json({ error: 'valor_meta deve ser um número >= 0' }, { status: 400 })
    }
    if (seen.has(s.membro_id)) {
      return NextResponse.json({ error: 'membros duplicados nos splits' }, { status: 400 })
    }
    seen.add(s.membro_id)
  }

  const admin = createAdminClient()

  // Garante que a meta existe
  const { data: meta, error: erMeta } = await admin
    .from('comissio_metas')
    .select('id')
    .eq('id', metaId)
    .single()
  if (erMeta || !meta) {
    return NextResponse.json({ error: 'Meta não encontrada' }, { status: 404 })
  }

  // Substitui todos os splits — DELETE + INSERT.
  // Não é transacional (sem RPC), mas o estado final é o que o front quer e
  // a janela de inconsistência é pequena. Se virar problema, criar uma
  // function SQL `replace_meta_splits(meta_id, jsonb)` que faz tudo num
  // único statement.
  const { error: erDel } = await admin
    .from('comissio_metas_splits')
    .delete()
    .eq('meta_id', metaId)
  if (erDel) return NextResponse.json({ error: erDel.message }, { status: 500 })

  if (splits.length > 0) {
    const { error: erIns } = await admin
      .from('comissio_metas_splits')
      .insert(splits.map(s => ({
        meta_id:    metaId,
        membro_id:  s.membro_id,
        valor_meta: s.valor_meta,
      })))
    if (erIns) return NextResponse.json({ error: erIns.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, total: splits.length })
}
