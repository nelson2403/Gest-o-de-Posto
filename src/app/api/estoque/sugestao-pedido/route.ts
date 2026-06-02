import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buscarEstoqueByGrupos, buscarVendasProdutos, buscarSubgrupos } from '@/lib/autosystem'

const GRUPO_COMBUSTIVEL  = 45481
const GRUPO_CONVENIENCIA = 9896787

// GET /api/estoque/sugestao-pedido?tipo=combustivel|conveniencia&empresa=<id>
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const tipo      = searchParams.get('tipo') ?? 'conveniencia'
  const empresaId = searchParams.get('empresa')

  const grupos = tipo === 'combustivel' ? [GRUPO_COMBUSTIVEL] : [GRUPO_CONVENIENCIA]

  const admin = createAdminClient()
  const { data: postos } = await admin
    .from('postos')
    .select('id, nome, codigo_empresa_externo')
    .not('codigo_empresa_externo', 'is', null)

  const postoMap: Record<string, { id: string; nome: string }> = {}
  for (const p of postos ?? []) {
    if (p.codigo_empresa_externo) postoMap[p.codigo_empresa_externo] = { id: p.id, nome: p.nome }
  }

  const empresaIds = (empresaId ? [empresaId] : Object.keys(postoMap)).map(Number)
  if (!empresaIds.length) return NextResponse.json({ sugestoes: [] })

  const hoje    = new Date()
  const dataFim = hoje.toISOString().slice(0, 10)
  const dataIni = new Date(hoje.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [estoque, vendas, subgruposAS] = await Promise.all([
    buscarEstoqueByGrupos(empresaIds, grupos),
    buscarVendasProdutos(empresaIds, grupos, dataIni, dataFim),
    buscarSubgrupos(),
  ])

  const subgrupoNomeMap: Record<number, string> = {}
  for (const sg of subgruposAS) subgrupoNomeMap[sg.grid] = sg.nome

  // Fornecedores vinculados aos postos
  const postoIds = Object.values(postoMap).map(p => p.id)
  const { data: vinculos } = await admin
    .from('fornecedor_postos')
    .select(`
      posto_id, dias_visita, prazo_entrega_dias,
      fornecedor:fornecedores(id, nome, telefone, contato, categoria)
    `)
    .in('posto_id', postoIds)

  // categoria do fornecedor deve bater com o tipo
  const categoriaFiltro = tipo === 'combustivel' ? 'combustivel' : 'conveniencia'
  const vinculoMap: Record<string, any[]> = {}
  for (const v of vinculos ?? []) {
    const f = v.fornecedor as any
    if (!f || (f.categoria !== categoriaFiltro && f.categoria !== 'geral')) continue
    if (!vinculoMap[v.posto_id]) vinculoMap[v.posto_id] = []
    vinculoMap[v.posto_id].push(v)
  }

  // Mapa estoque atual
  const estoqueMap: Record<string, number> = {}
  for (const e of estoque as any[]) {
    const key = `${e.empresa}|${e.produto}`
    estoqueMap[key] = (estoqueMap[key] ?? 0) + (e.estoque ?? 0)
  }

  // Mapa vendas 15 dias
  const vendasMap: Record<string, {
    total: number; nome: string; unid: string; subgrupo: number | null; codigo: string | null
  }> = {}
  for (const v of vendas as any[]) {
    const key = `${v.empresa}|${v.produto}`
    vendasMap[key] = {
      total:    (vendasMap[key]?.total ?? 0) + (v.total_vendido ?? 0),
      nome:     v.produto_nome,
      unid:     v.unid_med ?? 'UN',
      subgrupo: v.subgrupo ?? null,
      codigo:   v.produto_codigo ?? null,
    }
  }

  // Monta sugestões por empresa
  const sugestoesPorEmpresa: Record<string, any> = {}

  for (const [key, venda] of Object.entries(vendasMap)) {
    const [empresa, produto] = key.split('|')
    const mediadiaria   = venda.total / 15
    const estoqueAtual  = estoqueMap[key] ?? 0
    const estoque15dias = parseFloat((mediadiaria * 15).toFixed(2))
    const sugerido      = parseFloat(Math.max(0, estoque15dias - estoqueAtual).toFixed(2))

    if (sugerido <= 0 && estoqueAtual > 0) continue // estoque suficiente

    const postoInfo = postoMap[empresa]
    if (!postoInfo) continue

    if (!sugestoesPorEmpresa[empresa]) {
      sugestoesPorEmpresa[empresa] = {
        empresa,
        posto_nome: postoInfo.nome,
        posto_id:   postoInfo.id,
        fornecedores: vinculoMap[postoInfo.id] ?? [],
        produtos: [],
      }
    }

    sugestoesPorEmpresa[empresa].produtos.push({
      produto,
      produto_codigo:  venda.codigo,
      produto_nome:    venda.nome,
      unid_med:        venda.unid,
      subgrupo:        venda.subgrupo,
      subgrupo_nome:   venda.subgrupo ? (subgrupoNomeMap[venda.subgrupo] ?? null) : null,
      estoque_atual:   parseFloat(estoqueAtual.toFixed(2)),
      vendas_15dias:   parseFloat(venda.total.toFixed(2)),
      media_diaria:    parseFloat(mediadiaria.toFixed(2)),
      estoque_15dias:  estoque15dias,
      sugerido,
    })
  }

  const sugestoes = Object.values(sugestoesPorEmpresa).map(s => ({
    ...s,
    produtos: s.produtos.sort((a: any, b: any) => {
      const sg = (a.subgrupo_nome ?? 'zzz').localeCompare(b.subgrupo_nome ?? 'zzz')
      if (sg !== 0) return sg
      return b.sugerido - a.sugerido
    }),
  })).sort((a: any, b: any) => a.posto_nome.localeCompare(b.posto_nome))

  return NextResponse.json({ sugestoes, dataIni, dataFim })
}
