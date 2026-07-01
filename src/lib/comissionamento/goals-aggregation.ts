// ─────────────────────────────────────────────────────────────────────────────
// Cálculo de atingimento de meta por vendedor — função pura, sem I/O.
//
// Para cada meta com splits:
//   • filtra as vendas que casam com o filtro da meta (produto/grupo/subgrupo/
//     tipo, modo incluir/excluir, dentro do período da meta)
//   • para cada split (membro_id, meta individual), filtra as vendas do
//     vendedor correspondente (external_person_id = pessoa.grid)
//   • soma o campo desejado (faturamento/quantidade/margem/mix)
//   • atingimento = (realizado / meta_individual) * 100
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Venda, Meta, MetaSplit, Membro, AtingimentoMeta, MetaFiltroRegra,
} from './types'

// Aplica todos os filtros da meta a uma venda — combinados por AND. Cada
// filtro pode ser modo "incluir" (a venda precisa casar com algum valor) ou
// "excluir" (a venda NÃO pode casar com nenhum valor).
export function vendaCasaFiltrosMeta(sale: Venda, filtros: MetaFiltroRegra[]): boolean {
  if (!filtros || filtros.length === 0) return true
  for (const f of filtros) {
    if (!f.valores || f.valores.length === 0) continue   // filtro vazio = no-op
    const campo: string = (() => {
      switch (f.tipo) {
        case 'produto':          return sale.produto_nome ?? ''
        case 'grupo_produto':    return sale.grupo_produto ?? ''
        case 'subgrupo_produto': return sale.subgrupo_produto ?? ''
        case 'produto_tipo':     return sale.produto_tipo ?? ''
      }
    })()
    const valores = f.valores.map(v => v.trim().toLowerCase())
    const match = valores.includes(String(campo).trim().toLowerCase())
    const ok = f.modo === 'incluir' ? match : !match
    if (!ok) return false
  }
  return true
}

function vendaCasaFiltroMeta(sale: Venda, meta: Meta): boolean {
  // Período da meta
  if (sale.data < meta.period_start || sale.data > meta.period_end) return false
  return vendaCasaFiltrosMeta(sale, meta.filtros ?? [])
}

function realizadoNoCampo(vendas: Venda[], meta: Meta): number {
  if (meta.campo === 'faturamento') {
    return vendas.reduce((s, v) => s + v.valor_total, 0)
  }
  if (meta.campo === 'quantidade') {
    return vendas.reduce((s, v) => s + v.quantidade, 0)
  }
  if (meta.campo === 'mix') {
    // Mix = participação relativa do numerador no denominador, em %.
    //   realizado = (Σ qtd das vendas do numerador) / (Σ qtd das vendas do denominador) × 100
    // Preferimos comparar GRIDS (identificador único do AUTOSYSTEM) quando
    // disponíveis — robusto contra divergência de string entre o nome
    // cadastrado na categoria e o nome que vem da venda. Cai para nomes
    // (lowercase + trim) só quando os grids são null (meta legada).
    const numGrids = meta.mix_numerador_grids   ?? null
    const denGrids = meta.mix_denominador_grids ?? null
    if (numGrids && denGrids) {
      if (numGrids.length === 0 || denGrids.length === 0) return 0
      const numSet = new Set(numGrids)
      const denSet = new Set(denGrids)
      let qNum = 0, qDen = 0
      for (const v of vendas) {
        if (denSet.has(v.produto)) qDen += v.quantidade
        if (numSet.has(v.produto)) qNum += v.quantidade
      }
      return qDen > 0 ? (qNum / qDen) * 100 : 0
    }
    // Fallback legado por nome
    const num = (meta.mix_numerador   ?? []).map(s => s.trim().toLowerCase())
    const den = (meta.mix_denominador ?? []).map(s => s.trim().toLowerCase())
    if (num.length === 0 || den.length === 0) return 0
    const numSet = new Set(num)
    const denSet = new Set(den)
    let qNum = 0, qDen = 0
    for (const v of vendas) {
      const nome = (v.produto_nome ?? '').trim().toLowerCase()
      if (denSet.has(nome)) qDen += v.quantidade
      if (numSet.has(nome)) qNum += v.quantidade
    }
    return qDen > 0 ? (qNum / qDen) * 100 : 0
  }
  const fat   = vendas.reduce((s, v) => s + v.valor_total, 0)
  const lucro = vendas.reduce((s, v) => s + (v.valor_total - v.custo_medio_unitario * v.quantidade), 0)
  if (meta.campo === 'markup') {
    // markup (%) = lucro / custo × 100. Diferente da margem, que divide
    // pelo faturamento. Se a soma dos custos for 0, não é computável.
    const custo = fat - lucro
    return custo > 0 ? (lucro / custo) * 100 : 0
  }
  // margem (%) — lucro / faturamento × 100
  if (fat === 0) return 0
  return (lucro / fat) * 100
}

export interface CalcularAtingimentoInput {
  vendas:  Venda[]
  metas:   Meta[]
  splits:  MetaSplit[]
  membros: Membro[]
}

export interface CalcularAtingimentoOutput {
  // Mapa achatado: vendedor_id (pessoa.grid stringificado) → meta_id → atingimento %
  atingimentoPorVendedorPorMeta: Map<string, Map<string, number>>
  // Atingimento TOTAL da meta — realizado de todas as vendas no filtro
  // dividido pelo valor_meta global. Usado por regras de gerente que
  // precisam do "atingimento da loja inteira" (migration 127).
  atingimentoTotalPorMeta:       Map<string, number>
  // Lista detalhada (para UI / relatórios)
  detalhes: AtingimentoMeta[]
}

export function calcularAtingimento(input: CalcularAtingimentoInput): CalcularAtingimentoOutput {
  // membro_id → external_person_id (pessoa.grid)
  const membroToExternal = new Map<string, string>()
  const membroNome       = new Map<string, string>()
  for (const m of input.membros) {
    if (m.ativo && m.external_person_id) {
      membroToExternal.set(m.id, m.external_person_id)
      membroNome.set(m.id, m.nome)
    }
  }

  const atingByVendedor = new Map<string, Map<string, number>>()
  const atingTotal      = new Map<string, number>()
  const detalhes: AtingimentoMeta[] = []

  for (const meta of input.metas) {
    const vendasDaMeta = input.vendas.filter(v => vendaCasaFiltroMeta(v, meta))
    const splitsDaMeta = input.splits.filter(s => s.meta_id === meta.id)

    // Atingimento TOTAL da meta (independente do split). Usa o valor_meta
    // global da meta. Quando 0, o atingimento total fica 0 (não dá pra
    // dividir).
    const realizadoTotal = realizadoNoCampo(vendasDaMeta, meta)
    const valorMetaTotal = Number(meta.valor_meta) || 0
    const atingimentoTotal = valorMetaTotal > 0 ? (realizadoTotal / valorMetaTotal) * 100 : 0
    atingTotal.set(meta.id, atingimentoTotal)

    for (const split of splitsDaMeta) {
      const externalId = membroToExternal.get(split.membro_id)
      if (!externalId) continue

      const vendasDoVendedor = vendasDaMeta.filter(v => String(v.vendedor_id ?? '') === externalId)
      const realizado = realizadoNoCampo(vendasDoVendedor, meta)
      const atingimento = split.valor_meta > 0 ? (realizado / split.valor_meta) * 100 : 0

      detalhes.push({
        meta_id:         meta.id,
        meta_nome:       meta.nome,
        campo:           meta.campo,
        membro_id:       split.membro_id,
        vendedor_id:     externalId,
        meta_individual: split.valor_meta,
        realizado,
        atingimento,
        period_start:    meta.period_start,
        period_end:      meta.period_end,
      })

      let inner = atingByVendedor.get(externalId)
      if (!inner) { inner = new Map(); atingByVendedor.set(externalId, inner) }
      inner.set(meta.id, atingimento)
    }
  }

  return {
    atingimentoPorVendedorPorMeta: atingByVendedor,
    atingimentoTotalPorMeta:       atingTotal,
    detalhes,
  }
}
