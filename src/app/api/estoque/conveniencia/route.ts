import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const GRUPO_CONVENIENCIA = 9896787

// GET /api/estoque/conveniencia?empresa=...
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresaId = searchParams.get('empresa')

  const admin = createAdminClient()

  const { data: postos } = await admin
    .from('postos')
    .select('id, nome, codigo_empresa_externo')
    .not('codigo_empresa_externo', 'is', null)

  const postoMap: Record<string, string> = {}
  for (const p of postos ?? []) {
    if (p.codigo_empresa_externo) postoMap[p.codigo_empresa_externo] = p.nome
  }

  const empresaIds = (empresaId ? [empresaId] : Object.keys(postoMap)).map(Number)
  if (!empresaIds.length) return NextResponse.json({ dados: [] })

  // 1. Produtos do grupo conveniência
  const { data: produtos, error: errP } = await admin
    .from('as_produto')
    .select('grid, nome, unid_med, subgrupo')
    .eq('grupo', GRUPO_CONVENIENCIA)

  if (errP) return NextResponse.json({ error: errP.message }, { status: 500 })

  // 2. Subgrupos lookup
  const subgrupoIds = [...new Set((produtos ?? []).map(p => p.subgrupo).filter(Boolean))] as number[]
  const subgrupoLookup: Record<number, string> = {}
  if (subgrupoIds.length) {
    const { data: subgrupos } = await admin
      .from('as_subgrupo_produto')
      .select('grid, nome')
      .in('grid', subgrupoIds)
    for (const sg of subgrupos ?? []) subgrupoLookup[sg.grid] = sg.nome ?? 'Sem subgrupo'
  }

  const produtoLookup: Record<number, { nome: string; unid_med: string | null; subgrupo: number | null }> = {}
  for (const p of produtos ?? []) produtoLookup[p.grid] = p

  const produtoGrids = Object.keys(produtoLookup).map(Number)
  if (!produtoGrids.length) return NextResponse.json({ dados: [] })

  // 3. Estoque snapshot — somente estoque > 0
  const { data: estoque, error: errE } = await admin
    .from('as_estoque_produto')
    .select('empresa, produto, estoque, custo_medio, data')
    .in('empresa', empresaIds)
    .in('produto', produtoGrids)
    .gt('estoque', 0)

  if (errE) return NextResponse.json({ error: errE.message }, { status: 500 })

  // 4. Agrega por (empresa, produto)
  const agg: Record<string, { produto: number; subgrupo: number | null; estoque_total: number; custo_sum: number; count: number; data_ref: string | null }> = {}
  for (const e of estoque ?? []) {
    const key = `${e.empresa}|${e.produto}`
    const prod = produtoLookup[e.produto]
    if (!agg[key]) agg[key] = { produto: e.produto, subgrupo: prod?.subgrupo ?? null, estoque_total: 0, custo_sum: 0, count: 0, data_ref: null }
    agg[key].estoque_total += e.estoque ?? 0
    agg[key].custo_sum     += e.custo_medio ?? 0
    agg[key].count         += 1
    if (!agg[key].data_ref || (e.data && e.data > agg[key].data_ref!)) agg[key].data_ref = e.data
  }

  // 5. Monta estrutura por posto → subgrupo
  const postoDataMap: Record<string, Record<string, any[]>> = {}
  for (const [key, row] of Object.entries(agg)) {
    const empresa_str = key.split('|')[0]
    const prod = produtoLookup[row.produto]
    if (!prod) continue

    const sub_nome = row.subgrupo ? (subgrupoLookup[row.subgrupo] ?? 'Sem subgrupo') : 'Sem subgrupo'
    if (!postoDataMap[empresa_str]) postoDataMap[empresa_str] = {}
    if (!postoDataMap[empresa_str][sub_nome]) postoDataMap[empresa_str][sub_nome] = []

    const custo_medio = row.count > 0 ? row.custo_sum / row.count : 0
    postoDataMap[empresa_str][sub_nome].push({
      produto:         String(row.produto),
      produto_nome:    prod.nome,
      unid_med:        prod.unid_med ?? 'UN',
      estoque_total:   row.estoque_total,
      custo_medio,
      data_referencia: row.data_ref,
      valor_total:     row.estoque_total * custo_medio,
    })
  }

  const dados = Object.entries(postoDataMap)
    .map(([empresa, subgruposMap]) => {
      const subgrupos = Object.entries(subgruposMap).map(([subgrupo_nome, prods]) => ({
        subgrupo_nome,
        produtos:    prods.sort((a, b) => a.produto_nome.localeCompare(b.produto_nome)),
        total_valor: prods.reduce((s, p) => s + p.valor_total, 0),
        total_itens: prods.length,
      })).sort((a, b) => a.subgrupo_nome.localeCompare(b.subgrupo_nome))

      return {
        empresa,
        posto_nome:  postoMap[empresa] ?? empresa,
        subgrupos,
        total_valor: subgrupos.reduce((s, g) => s + g.total_valor, 0),
        total_itens: subgrupos.reduce((s, g) => s + g.total_itens, 0),
      }
    })
    .sort((a, b) => a.posto_nome.localeCompare(b.posto_nome))

  return NextResponse.json({ dados })
}
