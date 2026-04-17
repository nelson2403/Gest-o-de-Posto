import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/contas-pagar/autosystem-movtos?posto_id=&data=
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const posto_id = searchParams.get('posto_id')
  const data     = searchParams.get('data')

  if (!posto_id || !data)
    return NextResponse.json({ error: 'posto_id e data são obrigatórios' }, { status: 400 })

  const admin = createAdminClient()
  const { data: posto } = await admin
    .from('postos')
    .select('codigo_empresa_externo, nome')
    .eq('id', posto_id)
    .single()

  if (!posto?.codigo_empresa_externo)
    return NextResponse.json({ error: 'Posto sem código externo configurado' }, { status: 400 })

  const empresaGrid = parseInt(posto.codigo_empresa_externo)

  // Busca movimentos do dia no mirror
  const { data: movtos, error } = await admin
    .from('as_movto')
    .select('mlid, valor, motivo, documento, obs')
    .eq('empresa', empresaGrid)
    .eq('data', data)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Motivos lookup
  const motivoGrids = [...new Set((movtos ?? []).map(m => m.motivo).filter(Boolean))] as number[]
  const motivoLookup: Record<number, string> = {}
  if (motivoGrids.length) {
    const { data: motivos } = await admin.from('as_motivo_movto').select('grid, nome').in('grid', motivoGrids)
    for (const m of motivos ?? []) motivoLookup[m.grid] = m.nome ?? ''
  }

  const rows = (movtos ?? []).map(m => ({
    mlid:      m.mlid,
    valor:     m.valor,
    motivo:    m.motivo ? (motivoLookup[m.motivo] ?? String(m.motivo)) : null,
    documento: m.documento,
    obs:       m.obs,
  })).sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0))

  const total = rows.reduce((s, m) => s + (m.valor ?? 0), 0)

  return NextResponse.json({ movtos: rows, total: parseFloat(total.toFixed(2)) })
}
