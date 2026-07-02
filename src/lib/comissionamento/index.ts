// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator do motor de comissionamento.
//
//   calcularComissoes({ postoId, dataIni, dataFim, esquemaId })
//
// 1. Carrega regras (do esquema), metas+splits (do posto, no período),
//    membros (do posto) e vendas (AUTOSYSTEM).
// 2. Calcula atingimento por (vendedor, meta).
// 3. Para cada venda, resolve qual regra casa e quanto comissiona.
// 4. Agrega por vendedor (resumo).
//
// Retorna o resultado completo, pronto para alimentar a Fase 3 (simulação,
// relatórios e dashboard).
// ─────────────────────────────────────────────────────────────────────────────

import {
  carregarRegrasDoEsquema, carregarMetasDoPosto, carregarMembrosDoPosto,
  carregarVendas, resolverEmpresaExterna, carregarEsquema,
  carregarChecklistsDoPosto,
} from './data-loader'
import { calcularComissaoPorVendedor, vendaPassaProductFilters } from './rule-engine'
import { calcularAtingimento } from './goals-aggregation'
import type {
  Venda, Regra, Meta, MetaSplit, Membro, Esquema,
  ComissaoPorVendedor, AtingimentoMeta, ResumoVendedor,
} from './types'

export * from './types'
export { calcularComissaoPorVenda, calcularComissaoPorVendedor, simularRegrasVerbose } from './rule-engine'
export type {
  SimulacaoVenda, RegraSimulada, SimularInput,
  CalcularPorVendedorInput,
} from './rule-engine'
export { calcularAtingimento } from './goals-aggregation'

export interface CalcularComissoesInput {
  postoId:    string
  esquemaId:  string
  dataIni:    string  // YYYY-MM-DD
  dataFim:    string  // YYYY-MM-DD
}

export interface CalcularComissoesOutput {
  // Inputs ecoados para o consumidor poder mostrar contexto
  postoId:          string
  esquemaId:        string
  dataIni:          string
  dataFim:          string

  // Domínio carregado
  esquema:          Esquema | null
  regras:           Regra[]
  metas:            Meta[]
  splits:           MetaSplit[]
  membros:          Membro[]
  vendas:           Venda[]              // vendas brutas (todas)
  vendasNoEscopo:   Venda[]              // vendas que passaram pelo product_filters

  // Resultado do motor (modelo novo: agregado por vendedor)
  comissaoPorVendedor: ComissaoPorVendedor[]
  atingimentos:        AtingimentoMeta[]
  resumoPorVendedor:   ResumoVendedor[]

  // KPIs globais
  totais: {
    qtdVendas:        number
    faturamento:      number
    custo:            number
    lucroBruto:       number
    margem:           number
    comissaoTotal:    number
    qtdRegrasAtivas:  number
    qtdRegrasCasaram: number
  }
}

export async function calcularComissoes(input: CalcularComissoesInput): Promise<CalcularComissoesOutput> {
  const { postoId, esquemaId, dataIni, dataFim } = input

  // 1. Resolve empresa externa do posto
  const empresaExterna = await resolverEmpresaExterna(postoId)
  if (empresaExterna == null) {
    throw new Error('Posto sem codigo_empresa_externo cadastrado — não é possível buscar vendas no AUTOSYSTEM.')
  }

  // 2. Carrega todos os dados em paralelo
  const [esquema, regras, metasESplits, membros, vendas, checklists] = await Promise.all([
    carregarEsquema(esquemaId),
    carregarRegrasDoEsquema(esquemaId),
    carregarMetasDoPosto(postoId, dataIni, dataFim),
    carregarMembrosDoPosto(postoId),
    carregarVendas([empresaExterna], dataIni, dataFim),
    carregarChecklistsDoPosto(postoId, dataIni, dataFim),
  ])
  const { metas, splits } = metasESplits

  // 3. Aplica product_filters do esquema — vendas que não passam saem com
  // comissão zero (não entram na avaliação de regras). NÃO afeta o cálculo
  // de atingimento de meta: a meta tem seu próprio filtro (filtro_tipo /
  // filtro_valores / filtro_modo) que decide o que conta no realizado.
  // Misturar o escopo do esquema com o cálculo da meta levaria o sistema
  // a entender que metas mudam dependendo de qual esquema está sendo
  // aplicado — o que é incorreto: a meta é fato objetivo do vendedor.
  const productFilters = esquema?.product_filters ?? []
  const vendasNoEscopo = vendas.filter(v => vendaPassaProductFilters(v, productFilters))

  // 4. Calcula atingimento por (vendedor, meta) sobre TODAS as vendas do
  // posto no período — o filtro da própria meta refina o que conta.
  // Também devolve o atingimento TOTAL (todos os vendedores) por meta —
  // usado por regras de gerente (escopo='todos').
  const {
    atingimentoPorVendedorPorMeta,
    atingimentoTotalPorMeta,
    detalhes: atingimentos,
  } = calcularAtingimento({ vendas, metas, splits, membros, checklists })

  // 5. Aplica engine NOVO: 1 ComissaoPorVendedor por vendedor com a lista
  // de regras que casaram. Sem first-match-wins; várias regras podem
  // contribuir para o mesmo vendedor. `membros` permite que gerentes sem
  // vendas próprias entrem no loop (recebem comissão sobre agregado).
  // Agrega pontuação de checklist por template (soma total_pontos das
  // aplicações do posto no período). Alimenta ctx.pontuacao_checklist
  // nas regras que apontam checklist_template_referencia_id.
  const pontuacaoChecklistPorTemplate = new Map<string, number>()
  for (const a of checklists) {
    const cur = pontuacaoChecklistPorTemplate.get(a.template_id) ?? 0
    pontuacaoChecklistPorTemplate.set(a.template_id, cur + a.total_pontos)
  }

  const comissaoPorVendedor = calcularComissaoPorVendedor({
    vendas: vendasNoEscopo, regras, metas,
    atingimentoPorVendedorPorMeta,
    atingimentoTotalPorMeta,
    pontuacaoChecklistPorTemplate,
    membros,
  })

  // 6. Resumo por vendedor: comissão vem do engine; faturamento/custo/qtd
  // vêm de agregação direta sobre vendasNoEscopo (o engine novo não devolve
  // esses metadados — separação de responsabilidades).
  const externalToMembro = new Map<string, Membro>()
  for (const m of membros) {
    if (m.external_person_id) externalToMembro.set(m.external_person_id, m)
  }
  const atingByExternal = new Map<string, AtingimentoMeta[]>()
  for (const a of atingimentos) {
    const list = atingByExternal.get(a.vendedor_id) ?? []
    list.push(a)
    atingByExternal.set(a.vendedor_id, list)
  }

  // Map de comissão total por vendedor (key = pessoa.grid stringificado)
  const comissaoPorKey = new Map<string, number>()
  for (const cv of comissaoPorVendedor) {
    comissaoPorKey.set(cv.vendedor_id, cv.comissao_total)
  }

  // Agrega vendasNoEscopo por vendedor para faturamento/custo/qtd
  const resumoMap = new Map<string, ResumoVendedor>()
  for (const v of vendasNoEscopo) {
    const key = String(v.vendedor_id ?? 'sem-vendedor')
    let r = resumoMap.get(key)
    if (!r) {
      const m = externalToMembro.get(key) ?? null
      r = {
        vendedor_id:    key,
        vendedor_nome:  v.vendedor_nome ?? m?.nome ?? 'Sem vendedor',
        membro_id:      m?.id ?? null,
        membro_role:    m?.role ?? null,
        vendas_count:   0,
        quantidade:     0,
        faturamento:    0,
        custo:          0,
        lucro_bruto:    0,
        margem:         0,
        comissao_total: comissaoPorKey.get(key) ?? 0,
        atingimentos:   atingByExternal.get(key) ?? [],
      }
      resumoMap.set(key, r)
    }
    r.vendas_count += 1
    r.quantidade   += v.quantidade
    r.faturamento  += v.valor_total
    r.custo        += v.custo_medio_unitario * v.quantidade
  }
  // Vendedores que aparecem só em comissaoPorVendedor (vendas fora do
  // escopo do esquema mas com regra casando? não acontece hoje porque o
  // engine consome vendasNoEscopo, mas defensivo).
  for (const cv of comissaoPorVendedor) {
    if (resumoMap.has(cv.vendedor_id)) continue
    const m = externalToMembro.get(cv.vendedor_id) ?? null
    resumoMap.set(cv.vendedor_id, {
      vendedor_id:    cv.vendedor_id,
      vendedor_nome:  cv.vendedor_nome,
      membro_id:      m?.id ?? null,
      membro_role:    m?.role ?? null,
      vendas_count:   0,
      quantidade:     0,
      faturamento:    0,
      custo:          0,
      lucro_bruto:    0,
      margem:         0,
      comissao_total: cv.comissao_total,
      atingimentos:   atingByExternal.get(cv.vendedor_id) ?? [],
    })
  }

  for (const r of resumoMap.values()) {
    r.lucro_bruto = r.faturamento - r.custo
    r.margem      = r.faturamento > 0 ? (r.lucro_bruto / r.faturamento) * 100 : 0
  }
  const resumoPorVendedor = Array.from(resumoMap.values())
    .sort((a, b) => b.faturamento - a.faturamento)

  // 7. Totais — calculados sobre vendas no escopo (product_filters do esquema)
  const faturamento  = vendasNoEscopo.reduce((s, v) => s + v.valor_total, 0)
  const custo        = vendasNoEscopo.reduce((s, v) => s + v.custo_medio_unitario * v.quantidade, 0)
  const lucroBruto   = faturamento - custo
  const comissaoTot  = comissaoPorVendedor.reduce((s, cv) => s + cv.comissao_total, 0)
  const regrasAtivas = regras.filter(r => r.status === 'ativo').length
  // qtd de regras distintas que casaram em algum vendedor
  const regrasCasaramSet = new Set<string>()
  for (const cv of comissaoPorVendedor) {
    for (const c of cv.comissoes) regrasCasaramSet.add(c.regra_id)
  }

  return {
    postoId, esquemaId, dataIni, dataFim,
    esquema, regras, metas, splits, membros, vendas, vendasNoEscopo,
    comissaoPorVendedor, atingimentos, resumoPorVendedor,
    totais: {
      qtdVendas:        vendasNoEscopo.length,
      faturamento,
      custo,
      lucroBruto,
      margem:           faturamento > 0 ? (lucroBruto / faturamento) * 100 : 0,
      comissaoTotal:    comissaoTot,
      qtdRegrasAtivas:  regrasAtivas,
      qtdRegrasCasaram: regrasCasaramSet.size,
    },
  }
}
