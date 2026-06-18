import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolverEmpresaExterna, carregarVendas } from '@/lib/comissionamento/data-loader'

export const dynamic = 'force-dynamic'

// GET /api/comissionamento/vendas-por-vendedor
//   ?posto_id=UUID           obrigatório
//   &data_ini=YYYY-MM-DD     obrigatório
//   &data_fim=YYYY-MM-DD     obrigatório
//   &vendedor_id=BIGINT      obrigatório (pessoa.grid no AUTOSYSTEM)
//   &excluir_combustiveis=1  opcional (filtra produto_tipo !== 'C')
//
// Buscado sob demanda quando o usuário abre o modal "Vendas por grupo"
// no relatório de comissionamento — evita inflar o payload de /calcular.

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const postoId    = sp.get('posto_id')    ?? ''
  const dataIni    = sp.get('data_ini')    ?? ''
  const dataFim    = sp.get('data_fim')    ?? ''
  const vendedorId = sp.get('vendedor_id') ?? ''
  const excluirCombs = sp.get('excluir_combustiveis') === '1'

  if (!postoId)    return NextResponse.json({ error: 'posto_id é obrigatório' },    { status: 400 })
  if (!dataIni)    return NextResponse.json({ error: 'data_ini é obrigatório' },    { status: 400 })
  if (!dataFim)    return NextResponse.json({ error: 'data_fim é obrigatório' },    { status: 400 })
  if (!vendedorId) return NextResponse.json({ error: 'vendedor_id é obrigatório' }, { status: 400 })

  try {
    const empresaId = await resolverEmpresaExterna(postoId)
    if (empresaId == null) {
      return NextResponse.json({ error: 'Posto sem codigo_empresa_externo configurado' }, { status: 400 })
    }

    // Pega todas as vendas do posto no período e filtra no JS por vendedor
    // (a função do AUTOSYSTEM não tem filtro por vendedor no SQL).
    const todas = await carregarVendas([empresaId], dataIni, dataFim)
    const vidNum = Number(vendedorId)
    const vendas = todas.filter(v => {
      if (Number(v.vendedor_id ?? 0) !== vidNum) return false
      if (excluirCombs && v.produto_tipo === 'C') return false
      return true
    })

    return NextResponse.json({ vendas })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao buscar vendas'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
