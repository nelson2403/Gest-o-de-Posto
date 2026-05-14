import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  buscarAnaliseVendasPorProduto,
  buscarAnaliseVendasPorMes,
  buscarVendasComDesconto,
} from '@/lib/autosystem'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresaIdsRaw = searchParams.get('empresaIds') ?? ''
  const dataIni       = searchParams.get('dataIni') ?? ''
  const dataFim       = searchParams.get('dataFim') ?? ''
  const grupoIdsRaw   = searchParams.get('grupoIds') ?? ''

  if (!empresaIdsRaw || !dataIni || !dataFim) {
    return NextResponse.json({ error: 'Parâmetros ausentes' }, { status: 400 })
  }

  const empresaIds = empresaIdsRaw.split(',').map(Number).filter(n => !isNaN(n) && n > 0)
  if (!empresaIds.length) return NextResponse.json({ error: 'Nenhuma empresa' }, { status: 400 })

  const grupoIds = grupoIdsRaw ? grupoIdsRaw.split(',').map(Number).filter(n => !isNaN(n) && n > 0) : undefined

  const [{ produtos, temPrecoTabela }, porMes, { rows: vendasComDesconto }] = await Promise.all([
    buscarAnaliseVendasPorProduto(empresaIds, dataIni, dataFim, grupoIds),
    buscarAnaliseVendasPorMes(empresaIds, dataIni, dataFim, grupoIds),
    buscarVendasComDesconto(empresaIds, dataIni, dataFim, grupoIds),
  ])

  const totalVenda = produtos.reduce((s, p) => s + p.venda, 0)
  const totalCusto = produtos.reduce((s, p) => s + p.custo, 0)
  const lucro      = totalVenda - totalCusto
  const margem     = totalVenda > 0 ? (lucro / totalVenda) * 100 : 0

  return NextResponse.json({
    kpis: { venda: totalVenda, custo: totalCusto, lucro, margem },
    porMes: porMes.map(m => ({ ...m, lucro: m.venda - m.custo })),
    porProduto: produtos,
    vendasComDesconto,
    temPrecoTabela,
  })
}
