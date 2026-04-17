import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/contas-pagar/diagnostico-as?empresa=4
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresaCodigo = searchParams.get('empresa') ?? '4'

  const admin = createAdminClient()
  const resultado: Record<string, any> = { empresa_codigo: empresaCodigo }

  // 1. Resolve o grid real pelo codigo sequencial
  const { data: empRows } = await admin
    .from('as_empresa')
    .select('grid, nome')
    .eq('codigo', empresaCodigo)
    .limit(1)

  if (!empRows?.length) {
    resultado.erro = `Empresa codigo=${empresaCodigo} não encontrada`
    return NextResponse.json(resultado)
  }

  const grid = empRows[0].grid
  resultado.empresa_grid = String(grid)
  resultado.empresa_nome = empRows[0].nome

  // 2. Qualquer movto de abril/2026 (sem filtro de conta)
  const { data: abrilMovtos } = await admin
    .from('as_movto')
    .select('mlid, vencto, data, documento, valor, child, conta_debitar, conta_creditar, motivo, pessoa')
    .eq('empresa', grid)
    .gte('vencto', '2026-04-01')
    .lte('vencto', '2026-04-30')
    .order('vencto', { ascending: true })
    .order('valor', { ascending: false })
    .limit(30)

  // Pessoa/motivo lookups
  const pessoaIds = [...new Set((abrilMovtos ?? []).map(m => m.pessoa).filter(Boolean))] as number[]
  const pessoaLookup: Record<number, string> = {}
  if (pessoaIds.length) {
    const { data: pessoas } = await admin.from('as_pessoa').select('grid, nome').in('grid', pessoaIds)
    for (const p of pessoas ?? []) pessoaLookup[p.grid] = p.nome ?? ''
  }
  const motivoIds = [...new Set((abrilMovtos ?? []).map(m => m.motivo).filter(Boolean))] as number[]
  const motivoLookup: Record<number, string> = {}
  if (motivoIds.length) {
    const { data: motivos } = await admin.from('as_motivo_movto').select('grid, nome').in('grid', motivoIds)
    for (const m of motivos ?? []) motivoLookup[m.grid] = m.nome ?? ''
  }

  resultado.abril_todos = (abrilMovtos ?? []).map(m => ({
    mlid:          m.mlid,
    vencto:        m.vencto,
    data:          m.data,
    documento:     m.documento,
    valor:         m.valor,
    child:         m.child,
    conta_debitar: m.conta_debitar,
    conta_creditar: m.conta_creditar,
    pessoa_nome:   m.pessoa ? (pessoaLookup[m.pessoa] ?? null) : null,
    motivo_nome:   m.motivo ? (motivoLookup[m.motivo] ?? null) : null,
  }))

  // 3. Distribuição de conta_creditar
  const { data: todosMovtos } = await admin
    .from('as_movto')
    .select('conta_creditar, valor')
    .eq('empresa', grid)

  const contaAgg: Record<string, { qt: number; total: number }> = {}
  for (const m of todosMovtos ?? []) {
    const cc = m.conta_creditar ?? '(nulo)'
    if (!contaAgg[cc]) contaAgg[cc] = { qt: 0, total: 0 }
    contaAgg[cc].qt    += 1
    contaAgg[cc].total += m.valor ?? 0
  }
  resultado.contas_distribuicao = Object.entries(contaAgg)
    .map(([conta_creditar, v]) => ({ conta_creditar, qt: v.qt, total: parseFloat(v.total.toFixed(2)) }))
    .sort((a, b) => b.qt - a.qt)
    .slice(0, 20)

  // 4. Total em aberto abril (child = 0)
  const abrilAberto = (todosMovtos ?? []).filter(m => {
    // reuse abrilMovtos for this filter
    return false // placeholder — use dedicated query below
  })
  const { data: abrilAbertoData } = await admin
    .from('as_movto')
    .select('valor')
    .eq('empresa', grid)
    .eq('child', 0)
    .gte('vencto', '2026-04-01')
    .lte('vencto', '2026-04-30')

  resultado.abril_em_aberto = {
    qt:    (abrilAbertoData ?? []).length,
    total: parseFloat((abrilAbertoData ?? []).reduce((s, m) => s + (m.valor ?? 0), 0).toFixed(2)),
  }

  return NextResponse.json(resultado)
}
