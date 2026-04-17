import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const TOLERANCIA = 0.05  // 5%
const IGUALDADE  = 0.01  // diferença de até R$0,01 = igual

// POST /api/contas-pagar/reconciliar
// Body: { posto_id: string, data: string (YYYY-MM-DD) }
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { posto_id, data } = await req.json()
  if (!posto_id || !data)
    return NextResponse.json({ error: 'posto_id e data são obrigatórios' }, { status: 400 })

  const admin = createAdminClient()

  // 1. Busca código externo do posto
  const { data: posto } = await admin
    .from('postos')
    .select('codigo_empresa_externo, nome')
    .eq('id', posto_id)
    .single()

  if (!posto?.codigo_empresa_externo)
    return NextResponse.json({ error: 'Posto sem código externo configurado' }, { status: 400 })

  // 2. Busca lançamentos internos do dia
  const { data: lancamentos } = await admin
    .from('cp_lancamentos')
    .select('*')
    .eq('posto_id', posto_id)
    .eq('data_lancamento', data)

  if (!lancamentos?.length)
    return NextResponse.json({ reconciliados: 0, mensagem: 'Nenhum lançamento interno para reconciliar' })

  const empresaGrid = parseInt(posto.codigo_empresa_externo)

  // 3. Busca movimentos no mirror
  const { data: movtosData, error } = await admin
    .from('as_movto')
    .select('mlid, valor, motivo, data, documento, obs, child')
    .eq('empresa', empresaGrid)
    .eq('data', data)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Motivos lookup
  const motivoGrids = [...new Set((movtosData ?? []).map(m => m.motivo).filter(Boolean))] as number[]
  const motivoLookup: Record<number, string> = {}
  if (motivoGrids.length) {
    const { data: motivos } = await admin.from('as_motivo_movto').select('grid, nome').in('grid', motivoGrids)
    for (const m of motivos ?? []) motivoLookup[m.grid] = m.nome ?? ''
  }

  const movtos = (movtosData ?? []).map(m => ({
    mlid:      m.mlid,
    valor:     m.valor,
    motivo:    m.motivo ? (motivoLookup[m.motivo] ?? String(m.motivo)) : null,
    data:      m.data,
    documento: m.documento,
    obs:       m.obs,
    child:     m.child,
  })).sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0))

  // 4. Cruzamento
  const usados = new Set<number>()
  const updates: any[] = []

  for (const lanc of lancamentos) {
    const vlrLanc = parseFloat(lanc.valor)

    const match = movtos.find((m, i) => {
      if (usados.has(i)) return false
      const diff = Math.abs((m.valor ?? 0) - vlrLanc)
      const pct  = vlrLanc > 0 ? diff / vlrLanc : diff
      return pct <= TOLERANCIA
    })

    if (!match) {
      updates.push({ id: lanc.id, status: 'so_sistema', movto_mlid: null, valor_autosystem: null, divergencia_valor: null })
    } else {
      const idx = movtos.indexOf(match)
      usados.add(idx)
      const diverge = Math.abs((match.valor ?? 0) - vlrLanc) > IGUALDADE
      updates.push({
        id: lanc.id,
        status: diverge ? 'divergente' : 'encontrado',
        movto_mlid: Number(match.mlid),
        valor_autosystem: match.valor,
        divergencia_valor: diverge ? parseFloat(((match.valor ?? 0) - vlrLanc).toFixed(2)) : 0,
      })
    }
  }

  // 5. Persiste resultados
  for (const u of updates) {
    const { id, ...payload } = u
    await admin.from('cp_lancamentos').update(payload).eq('id', id)
  }

  // 6. Movimentos do AutoSystem sem correspondência interna
  const soAutosystem = movtos
    .filter((_, i) => !usados.has(i))
    .map(m => ({ mlid: m.mlid, valor: m.valor, motivo: m.motivo, documento: m.documento }))

  return NextResponse.json({
    reconciliados: updates.length,
    encontrados:   updates.filter(u => u.status === 'encontrado').length,
    divergentes:   updates.filter(u => u.status === 'divergente').length,
    so_sistema:    updates.filter(u => u.status === 'so_sistema').length,
    so_autosystem: soAutosystem,
  })
}
