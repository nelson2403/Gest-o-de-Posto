import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ROLES = ['master', 'adm_financeiro']

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { data: u } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
  if (!u || !ROLES.includes(u.role)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const admin = createAdminClient()

  const [{ data: salgados }, { data: insumos }, { data: producoes }, { data: pedidos }] = await Promise.all([
    admin.from('salgados').select('id, nome, unidade, custo, preco_venda, estoque'),
    admin.from('salgados_insumos').select('id, nome, unidade, custo_unitario, estoque'),
    admin.from('salgados_producao').select('salgado_id, quantidade, custo_total, salgado:salgados(nome)'),
    admin.from('salgados_pedidos')
      .select('id, status, posto:postos(nome), itens:salgados_pedido_itens(quantidade, preco_unitario)')
      .eq('status', 'entregue'),
  ])

  // Produção acumulada por salgado
  const prodMap: Record<string, { nome: string; qtd: number; custo: number }> = {}
  for (const p of (producoes ?? []) as any[]) {
    const nome = p.salgado?.nome ?? '—'
    if (!prodMap[p.salgado_id]) prodMap[p.salgado_id] = { nome, qtd: 0, custo: 0 }
    prodMap[p.salgado_id].qtd += Number(p.quantidade || 0)
    prodMap[p.salgado_id].custo += Number(p.custo_total || 0)
  }
  const producaoPorSalgado = Object.values(prodMap).sort((a, b) => b.qtd - a.qtd)

  // Vendas (entregues) por loja
  const vendaMap: Record<string, { qtd: number; valor: number }> = {}
  for (const ped of (pedidos ?? []) as any[]) {
    const loja = ped.posto?.nome ?? 'Sem loja'
    if (!vendaMap[loja]) vendaMap[loja] = { qtd: 0, valor: 0 }
    for (const it of ped.itens ?? []) {
      vendaMap[loja].qtd += Number(it.quantidade || 0)
      vendaMap[loja].valor += Number(it.quantidade || 0) * Number(it.preco_unitario || 0)
    }
  }
  const vendasPorLoja = Object.entries(vendaMap)
    .map(([loja, v]) => ({ loja, ...v }))
    .sort((a, b) => b.valor - a.valor)

  // Margem por salgado
  const margemSalgados = (salgados ?? []).map((s: any) => {
    const margem = s.preco_venda ? ((s.preco_venda - s.custo) / s.preco_venda) * 100 : 0
    return { nome: s.nome, unidade: s.unidade, custo: s.custo, preco_venda: s.preco_venda, margem, estoque: s.estoque }
  }).sort((a, b) => b.margem - a.margem)

  const valorEstoqueInsumos = (insumos ?? []).reduce((a: number, i: any) => a + Number(i.estoque || 0) * Number(i.custo_unitario || 0), 0)
  const valorEstoqueSalgados = (salgados ?? []).reduce((a: number, s: any) => a + Number(s.estoque || 0) * Number(s.custo || 0), 0)
  const totalVendas = vendasPorLoja.reduce((a, v) => a + v.valor, 0)
  const totalProduzido = producaoPorSalgado.reduce((a, p) => a + p.qtd, 0)

  return NextResponse.json({
    resumo: { valorEstoqueInsumos, valorEstoqueSalgados, totalVendas, totalProduzido },
    producaoPorSalgado,
    vendasPorLoja,
    margemSalgados,
    insumos: (insumos ?? []).map((i: any) => ({ ...i, valor: Number(i.estoque || 0) * Number(i.custo_unitario || 0) })),
  })
}
