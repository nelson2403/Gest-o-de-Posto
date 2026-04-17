import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const GRUPOS_PISTA = [45482, 45483, 45486, 45487, 45492, 16574993]

// GET /api/estoque/pista?empresa=...
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

  // 1. Produtos dos grupos da pista
  const { data: produtos, error: errP } = await admin
    .from('as_produto')
    .select('grid, nome, unid_med, grupo')
    .in('grupo', GRUPOS_PISTA)

  if (errP) return NextResponse.json({ error: errP.message }, { status: 500 })

  // 2. Grupos lookup
  const { data: grupos } = await admin
    .from('as_grupo_produto')
    .select('grid, nome')
    .in('grid', GRUPOS_PISTA)

  const grupoLookup: Record<number, string> = {}
  for (const g of grupos ?? []) grupoLookup[g.grid] = g.nome ?? 'Outros'

  const produtoLookup: Record<number, { nome: string; unid_med: string | null; grupo: number | null }> = {}
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
  const agg: Record<string, { produto: number; grupo: number | null; estoque_total: number; custo_sum: number; count: number; data_ref: string | null }> = {}
  for (const e of estoque ?? []) {
    const key = `${e.empresa}|${e.produto}`
    const prod = produtoLookup[e.produto]
    if (!agg[key]) agg[key] = { produto: e.produto, grupo: prod?.grupo ?? null, estoque_total: 0, custo_sum: 0, count: 0, data_ref: null }
    agg[key].estoque_total += e.estoque ?? 0
    agg[key].custo_sum     += e.custo_medio ?? 0
    agg[key].count         += 1
    if (!agg[key].data_ref || (e.data && e.data > agg[key].data_ref!)) agg[key].data_ref = e.data
  }

  // 5. Monta estrutura por posto → grupo
  const postoDataMap: Record<string, Record<string, any[]>> = {}
  for (const [key, row] of Object.entries(agg)) {
    const empresa_str = key.split('|')[0]
    const prod = produtoLookup[row.produto]
    if (!prod) continue

    const grupo_nome = row.grupo ? (grupoLookup[row.grupo] ?? 'Outros') : 'Outros'
    if (!postoDataMap[empresa_str]) postoDataMap[empresa_str] = {}
    if (!postoDataMap[empresa_str][grupo_nome]) postoDataMap[empresa_str][grupo_nome] = []

    const custo_medio = row.count > 0 ? row.custo_sum / row.count : 0
    postoDataMap[empresa_str][grupo_nome].push({
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
    .map(([empresa, gruposMap]) => {
      const grupos_posto = Object.entries(gruposMap).map(([grupo_nome, prods]) => ({
        grupo_nome,
        produtos:    prods.sort((a, b) => a.produto_nome.localeCompare(b.produto_nome)),
        total_valor: prods.reduce((s, p) => s + p.valor_total, 0),
        total_itens: prods.length,
      })).sort((a, b) => a.grupo_nome.localeCompare(b.grupo_nome))

      return {
        empresa,
        posto_nome:  postoMap[empresa] ?? empresa,
        grupos:      grupos_posto,
        total_valor: grupos_posto.reduce((s, g) => s + g.total_valor, 0),
        total_itens: grupos_posto.reduce((s, g) => s + g.total_itens, 0),
      }
    })
    .sort((a, b) => a.posto_nome.localeCompare(b.posto_nome))

  return NextResponse.json({ dados })
}
