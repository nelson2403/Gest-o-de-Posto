import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── PUT — substitui todos os postos vinculados ao esquema ──────────────────
//
// Body: { posto_ids: string[] }
//
// DELETE + INSERT em batch (sem transação) — o estado final reflete a lista
// enviada. Postos removidos do array saem da tabela.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: esquemaId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Partial<{ posto_ids: string[] }>
  const posto_ids = Array.isArray(body.posto_ids) ? Array.from(new Set(body.posto_ids)) : []

  const admin = createAdminClient()

  // Garante que o esquema existe
  const { data: esq, error: erEsq } = await admin
    .from('comissio_esquemas')
    .select('id')
    .eq('id', esquemaId)
    .single()
  if (erEsq || !esq) return NextResponse.json({ error: 'Esquema não encontrado' }, { status: 404 })

  // DELETE + INSERT
  const { error: erDel } = await admin
    .from('comissio_esquema_postos')
    .delete()
    .eq('esquema_id', esquemaId)
  if (erDel) return NextResponse.json({ error: erDel.message }, { status: 500 })

  if (posto_ids.length > 0) {
    const { error: erIns } = await admin
      .from('comissio_esquema_postos')
      .insert(posto_ids.map(pid => ({ esquema_id: esquemaId, posto_id: pid })))
    if (erIns) return NextResponse.json({ error: erIns.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, total: posto_ids.length })
}
