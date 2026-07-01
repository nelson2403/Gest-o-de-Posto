// ─────────────────────────────────────────────────────────────────────────────
// Motor de cálculo de comissões — função pura, sem I/O.
//
// Entrada: vendas + regras (de um esquema) + atingimentos por (vendedor, meta).
// Saída:   uma entrada por venda dizendo qual regra casou e quanto comissionou.
//
// Estratégia (espelha o reference C:/Projetos/comissionamento_as):
//
// 1. Pré-computa, para cada regra, os totais por vendedor — somando apenas as
//    vendas que casam com as condições de PRODUTO da regra (campos
//    produto/grupo_produto/subgrupo_produto). Isso porque os campos
//    "faturamento"/"quantidade"/"mix" no contexto da regra representam o
//    TOTAL do vendedor no período, dentro do escopo da regra — não o valor
//    da venda atual.
//
// 2. Para cada venda, monta o contexto de avaliação:
//      - campos da venda (produto, vendedor, cargo, ...)
//      - totais do vendedor (faturamento, quantidade, mix, margem)
//      - atingimento_meta resolvido a partir da meta que cobre essa venda
//
// 3. Avalia as regras ATIVAS em ordem crescente de prioridade. Primeira que
//    avalia para `true` ganha. Calcula a comissão pelo modo/tipo da regra.
//
// 4. Vendas sem nenhuma regra casando recebem comissão zero (regra_id null).
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Venda, Regra, Meta, ProductFilter, Membro,
  ConditionGroup, FieldKey, OperatorKey,
  ResultadoModo, ResultadoTipo,
  VendaComissionada, BreakdownCalculo,
  RegraCampo, ComissaoPorRegra, ComissaoPorVendedor,
} from './types'

// ── Escopo da ação ──────────────────────────────────────────────────────────
//
// Quando uma regra define `escopo_tipo` + `escopo_valor`, ela só casa para
// vendas onde o campo correspondente bate (case-insensitive). É um filtro
// implícito no painel SE, mas declarado no painel ENTÃO para deixar a regra
// auto-descritiva ("4% sobre faturamento DE BALDES LUBRIFICANTES").
function vendaPassaEscopoRegra(sale: Venda, regra: Regra): boolean {
  if (!regra.escopo_tipo || !regra.escopo_valor || !regra.escopo_valor.trim()) return true
  const alvo = regra.escopo_valor.trim().toLowerCase()
  let campo = ''
  switch (regra.escopo_tipo) {
    case 'produto':          campo = sale.produto_nome      ?? ''; break
    case 'grupo_produto':    campo = sale.grupo_produto     ?? ''; break
    case 'subgrupo_produto': campo = sale.subgrupo_produto  ?? ''; break
  }
  return campo.trim().toLowerCase() === alvo
}

// ── Filtro de produto a nível de esquema ────────────────────────────────────
//
// Aplica TODOS os filtros (combinados por AND). Uma venda passa quando casa
// com cada filtro individual.
export function vendaPassaProductFilters(sale: Venda, filtros: ProductFilter[]): boolean {
  if (!filtros || filtros.length === 0) return true
  for (const f of filtros) {
    if (!f.valores || f.valores.length === 0) continue  // filtro vazio = no-op
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

// ── Avaliação de condições ──────────────────────────────────────────────────

interface EvalContext {
  // Campos diretos da venda
  produto:           string
  grupo_produto:     string
  subgrupo_produto:  string
  vendedor:          string
  cargo:             string
  posto:             string  // codigo_empresa_externo, stringificado

  // Totais do vendedor (filtrados pelas condições de produto da regra)
  faturamento:       number
  quantidade:        number
  mix:               number
  margem:            number

  // Atingimento da meta que cobre essa venda (% — null se sem meta)
  atingimento_meta:  number | null
  // Pontuação da aplicação do checklist apontado pela regra
  // (checklist_template_referencia_id). null quando a regra não aponta
  // nenhum template ou não há aplicação no período.
  pontuacao_checklist: number | null
}

interface ConditionLike {
  field:    FieldKey  | null
  operator: OperatorKey | null
  value:    string | number | null
  value2?:  string | number | null
}

function compareNumber(a: number, op: OperatorKey, b: number, b2?: number): boolean {
  switch (op) {
    case 'eq':      return a === b
    case 'neq':     return a !== b
    case 'gt':      return a > b
    case 'gte':     return a >= b
    case 'lt':      return a < b
    case 'lte':     return a <= b
    case 'between': return a >= b && a <= (b2 ?? Infinity)
    default:        return false
  }
}

function compareString(a: string, op: OperatorKey, b: string): boolean {
  const al = a.toLowerCase()
  const bl = b.toLowerCase()
  switch (op) {
    case 'eq':            return al === bl
    case 'neq':           return al !== bl
    case 'contains':      return al.includes(bl)
    case 'not_contains':  return !al.includes(bl)
    case 'starts_with':   return al.startsWith(bl)
    case 'in':            return bl.split(',').map(s => s.trim()).includes(al)
    case 'not_in':        return !bl.split(',').map(s => s.trim()).includes(al)
    default:              return false
  }
}

function evaluateCondition(c: ConditionLike, ctx: EvalContext): boolean {
  if (!c.field || !c.operator || c.value === null) return true  // ignorar incompletas

  // atingimento_meta: precisa de um valor resolvido — sem meta → falso
  if (c.field === 'atingimento_meta') {
    if (ctx.atingimento_meta === null) return false
    return compareNumber(
      ctx.atingimento_meta,
      c.operator,
      Number(c.value),
      c.value2 != null ? Number(c.value2) : undefined,
    )
  }

  // pontuacao_checklist: mesma lógica — regra tem que apontar um template
  // e existir aplicação no período; senão, falso (não bate a condição).
  if (c.field === 'pontuacao_checklist') {
    if (ctx.pontuacao_checklist === null) return false
    return compareNumber(
      ctx.pontuacao_checklist,
      c.operator,
      Number(c.value),
      c.value2 != null ? Number(c.value2) : undefined,
    )
  }

  const raw = ctx[c.field as keyof EvalContext]
  if (raw === null || raw === undefined) return false

  // Campos numéricos
  if (typeof raw === 'number') {
    return compareNumber(
      raw,
      c.operator,
      Number(c.value),
      c.value2 != null ? Number(c.value2) : undefined,
    )
  }

  // Campos texto
  return compareString(String(raw), c.operator, String(c.value))
}

function evaluateGroup(g: ConditionGroup, ctx: EvalContext): boolean {
  const resultados: boolean[] = []
  for (const c of g.conditions) resultados.push(evaluateCondition(c, ctx))
  for (const sub of g.groups)   resultados.push(evaluateGroup(sub, ctx))
  if (resultados.length === 0)  return true  // grupo vazio → match (aplica sempre)
  return g.logic === 'AND' ? resultados.every(Boolean) : resultados.some(Boolean)
}

// ── Extração das condições de produto p/ pré-filtro de totais ──────────────

function extractProductConditions(g: ConditionGroup): ConditionLike[] {
  const out: ConditionLike[] = []
  for (const c of g.conditions) {
    if (c.field === 'produto' || c.field === 'grupo_produto' || c.field === 'subgrupo_produto') {
      out.push(c)
    }
  }
  for (const sub of g.groups) out.push(...extractProductConditions(sub))
  return out
}

function vendaMatchesProductConditions(sale: Venda, conds: ConditionLike[]): boolean {
  if (conds.length === 0) return true
  const ctx: Record<string, string> = {
    produto:           sale.produto_nome ?? '',
    grupo_produto:     sale.grupo_produto ?? '',
    subgrupo_produto:  sale.subgrupo_produto ?? '',
  }
  return conds.every(c => {
    if (!c.field || !c.operator || c.value === null) return true
    return compareString(ctx[c.field] ?? '', c.operator, String(c.value))
  })
}

// ── Resolução: qual meta cobre uma venda ────────────────────────────────────
// Quando há múltiplas metas elegíveis, prefere a mais específica (filtro
// "incluir" > "excluir" > sem filtro).

function metaCobreVenda(meta: Meta, sale: Venda): boolean {
  // 1. Período da meta tem que cobrir a data da venda
  if (sale.data < meta.period_start || sale.data > meta.period_end) return false

  // 2. Filtros da meta (combinados por AND)
  const filtros = meta.filtros ?? []
  if (filtros.length === 0) return true
  for (const f of filtros) {
    if (!f.valores || f.valores.length === 0) continue
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

function metaEspecificidade(meta: Meta): number {
  const filtros = meta.filtros ?? []
  if (filtros.length === 0) return 0
  // Filtros "incluir" tornam a meta mais específica do que "excluir".
  // Conta a quantidade de filtros + bônus por modo incluir.
  let score = 0
  for (const f of filtros) {
    if (!f.valores || f.valores.length === 0) continue
    score += f.modo === 'incluir' ? 2 : 1
  }
  return score
}

function escolherMetaParaVenda(sale: Venda, metas: Meta[]): Meta | null {
  let melhor: Meta | null = null
  let pontos = -1
  for (const m of metas) {
    if (m.posto_id == null) continue
    if (!metaCobreVenda(m, sale)) continue
    const s = metaEspecificidade(m)
    if (s > pontos) { melhor = m; pontos = s }
  }
  return melhor
}

// ── Cálculo do valor da comissão segundo modo/tipo ──────────────────────────

function calcularComissaoValor(
  sale:  Venda,
  regra: Regra,
): { valor: number; breakdown: BreakdownCalculo } {
  const modo = regra.resultado_modo
  const taxa = regra.resultado_valor

  const fmtBRL = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

  if (modo === 'sobre') {
    // Base é o valor da PRÓPRIA venda na dimensão escolhida.
    // A UI restringe ResultadoTipo a vendas_rs/lucro_bruto; outras opções
    // permanecem aceitas para compatibilidade com regras antigas.
    let base = 0
    let descBase = ''
    switch (regra.resultado_tipo as ResultadoTipo) {
      case 'vendas_rs':
        base = sale.valor_total
        descBase = `Faturamento ${fmtBRL(base)}`
        break
      case 'lucro_bruto':
        base = sale.valor_total - sale.custo_medio_unitario * sale.quantidade
        descBase = `Lucro bruto ${fmtBRL(base)}`
        break
      case 'quantidade':
        base = sale.quantidade
        descBase = `Quantidade ${base}`
        break
      default:
        base = sale.valor_total
        descBase = `Faturamento ${fmtBRL(base)}`
    }
    const valor = (base * taxa) / 100
    return {
      valor,
      breakdown: {
        base_valor:     base,
        base_descricao: `${taxa}% sobre ${descBase}`,
        modo, tipo: regra.resultado_tipo, taxa,
        comissao_final: valor,
      },
    }
  }

  if (modo === 'por_unidade') {
    const qtd = sale.quantidade
    const valor = qtd * taxa
    return {
      valor,
      breakdown: {
        base_valor:     qtd,
        base_descricao: `${fmtBRL(taxa)} × ${qtd} un.`,
        modo, tipo: regra.resultado_tipo, taxa,
        comissao_final: valor,
      },
    }
  }

  // a_cada — R$ X a cada R$ Y de faturamento
  const faixa = regra.resultado_base_valor || 0
  const faturamento = sale.valor_total
  const passos = faixa > 0 ? Math.floor(faturamento / faixa) : 0
  const valor = passos * taxa
  return {
    valor,
    breakdown: {
      base_valor:     faturamento,
      base_descricao: `${fmtBRL(taxa)} × ${passos} faixa(s) de ${fmtBRL(faixa)}`,
      modo, tipo: regra.resultado_tipo, taxa,
      comissao_final: valor,
    },
  }
}

// ── Função pública ──────────────────────────────────────────────────────────

export interface CalcularRegrasInput {
  vendas: Venda[]
  regras: Regra[]
  metas:  Meta[]
  /**
   * Mapa atingimento_por_vendedor_por_meta: vendedor_id (pessoa.grid como
   * string) → meta_id → atingimento (%). Pode vir vazio se o caller não
   * pré-calculou metas — nesse caso condições de atingimento_meta nunca
   * casam.
   */
  atingimentoPorVendedorPorMeta?: Map<string, Map<string, number>>
  postoIdToCodigoEmpresa?:        Map<string, number>  // opcional, p/ campo 'posto'
}

export function calcularComissaoPorVenda(input: CalcularRegrasInput): VendaComissionada[] {
  const regrasAtivas = input.regras
    .filter(r => r.status === 'ativo')
    .slice()
    .sort((a, b) => a.prioridade - b.prioridade)

  // Pré-computa, por regra, os totais por vendedor (filtrados pelas
  // condições de produto da regra). Map chave = `${regraId}|${vendedorKey}`.
  const totaisPorRegraVendedor = new Map<string, { faturamento: number; quantidade: number; produtosDistintos: Set<number>; margemSomaPonderada: number }>()
  for (const regra of regrasAtivas) {
    const productConds = extractProductConditions(regra.condicoes)
    for (const v of input.vendas) {
      if (!vendaMatchesProductConditions(v, productConds)) continue
      if (!vendaPassaEscopoRegra(v, regra)) continue
      const vKey = String(v.vendedor_id ?? 'sem-vendedor')
      const k = `${regra.id}|${vKey}`
      const cur = totaisPorRegraVendedor.get(k) ?? {
        faturamento: 0, quantidade: 0, produtosDistintos: new Set<number>(), margemSomaPonderada: 0,
      }
      cur.faturamento += v.valor_total
      cur.quantidade  += v.quantidade
      cur.produtosDistintos.add(v.produto)
      const lucro = v.valor_total - v.custo_medio_unitario * v.quantidade
      cur.margemSomaPonderada += lucro  // somatório de lucro (margem ponderada calculada depois)
      totaisPorRegraVendedor.set(k, cur)
    }
  }

  // Mapa de meta-da-venda pré-computado uma vez (a venda só tem uma meta).
  const metaPorVenda = input.vendas.map(v => escolherMetaParaVenda(v, input.metas))

  return input.vendas.map((sale, idx) => {
    const meta = metaPorVenda[idx]
    const vKey = String(sale.vendedor_id ?? 'sem-vendedor')
    const atingByMeta = input.atingimentoPorVendedorPorMeta?.get(vKey) ?? null
    const atingimento = meta && atingByMeta ? (atingByMeta.get(meta.id) ?? null) : null

    for (const regra of regrasAtivas) {
      // Escopo da ação — a regra só alcança vendas dentro do filtro
      if (!vendaPassaEscopoRegra(sale, regra)) continue

      const totais = totaisPorRegraVendedor.get(`${regra.id}|${vKey}`)
      const faturamento = totais?.faturamento ?? sale.valor_total
      const quantidade  = totais?.quantidade  ?? sale.quantidade
      const mix         = totais?.produtosDistintos.size ?? 1
      const margem      = faturamento > 0
        ? ((totais?.margemSomaPonderada ?? (sale.valor_total - sale.custo_medio_unitario * sale.quantidade)) / faturamento) * 100
        : 0

      // Meta de referência da regra (se setada) sobrescreve o atingimento
      // calculado pela meta atribuída à venda. Resolve casos onde a meta
      // (com filtros) NÃO cobre a venda atual mas o usuário ainda quer
      // verificar o atingimento dessa meta nas condições.
      const atingimentoFinal = regra.meta_referencia_id
        ? (atingByMeta?.get(regra.meta_referencia_id) ?? null)
        : atingimento

      const ctx: EvalContext = {
        produto:           sale.produto_nome ?? '',
        grupo_produto:     sale.grupo_produto ?? '',
        subgrupo_produto:  sale.subgrupo_produto ?? '',
        vendedor:          sale.vendedor_nome ?? '',
        cargo:             sale.cargo ?? '',
        posto:             String(sale.empresa_id ?? ''),
        faturamento, quantidade, mix, margem,
        atingimento_meta: atingimentoFinal,
        pontuacao_checklist: null,  // não suportado no engine antigo por venda
      }

      if (evaluateGroup(regra.condicoes, ctx)) {
        const { valor, breakdown } = calcularComissaoValor(sale, regra)
        return {
          venda:           sale,
          regra_id:        regra.id,
          regra_nome:      regra.nome,
          comissao:        valor,
          meta_atribuida:  meta?.id ?? null,
          breakdown,
        }
      }
    }

    return {
      venda:           sale,
      regra_id:        null,
      regra_nome:      null,
      comissao:        0,
      meta_atribuida:  meta?.id ?? null,
      breakdown:       null,
    }
  })
}

// ── Modo verbose: simula a aplicação de TODAS as regras a uma venda ─────────
//
// Usado pela tela de Simulação para mostrar o trace passo-a-passo:
//   - quais regras foram avaliadas (em ordem de prioridade)
//   - quais casaram (matched: true)
//   - quanto cada uma comissionaria (se casasse)
//   - qual ganhou (first match)
// ─────────────────────────────────────────────────────────────────────────────

export interface RegraSimulada {
  regra_id:        string
  regra_nome:      string
  prioridade:      number
  matched:         boolean
  vencedora:       boolean   // first match wins
  comissao:        number    // sempre populado: o quanto comissionaria se casasse
  breakdown:       BreakdownCalculo
}

export interface SimulacaoVenda {
  venda:               Venda
  meta_atribuida:      string | null
  atingimento_aplicado: number | null   // % usada no contexto
  regras:              RegraSimulada[]
  vencedora_id:        string | null
  comissao_final:      number
}

export interface SimularInput {
  venda:                       Venda
  regras:                      Regra[]
  metas?:                      Meta[]
  atingimentoOverride?:        number | null  // se passado, vira o atingimento_meta
  atingimentoPorVendedorPorMeta?: Map<string, Map<string, number>>
}

export function simularRegrasVerbose(input: SimularInput): SimulacaoVenda {
  const regrasAtivas = input.regras
    .filter(r => r.status === 'ativo')
    .slice()
    .sort((a, b) => a.prioridade - b.prioridade)

  const sale = input.venda
  const meta = input.metas ? escolherMetaParaVenda(sale, input.metas) : null

  // Atingimento: override > mapa pré-computado > null
  let atingimento: number | null = input.atingimentoOverride ?? null
  if (atingimento === null && meta && input.atingimentoPorVendedorPorMeta) {
    const vKey = String(sale.vendedor_id ?? 'sem-vendedor')
    atingimento = input.atingimentoPorVendedorPorMeta.get(vKey)?.get(meta.id) ?? null
  }

  // Como aqui temos só UMA venda, totais por regra = a própria venda
  // (filtrada pelas condições de produto da regra). Se não casar → totais zero.
  const resultados: RegraSimulada[] = []
  let vencedoraId: string | null = null
  let comissaoFinal = 0

  for (const regra of regrasAtivas) {
    const productConds = extractProductConditions(regra.condicoes)
    const casaProdutos = vendaMatchesProductConditions(sale, productConds)
    const passaEscopo  = vendaPassaEscopoRegra(sale, regra)
    const fatorEscopo  = casaProdutos ? 1 : 0
    const faturamento  = sale.valor_total * fatorEscopo
    const quantidade   = sale.quantidade * fatorEscopo
    const lucroLinha   = (sale.valor_total - sale.custo_medio_unitario * sale.quantidade) * fatorEscopo
    const margem       = faturamento > 0 ? (lucroLinha / faturamento) * 100 : 0

    // Meta de referência da regra sobrescreve o atingimento (mesma lógica
    // do modo de cálculo real). O override manual da simulação tem
    // prioridade máxima — mantém o "what-if" funcionando.
    let atingimentoCtx: number | null = atingimento
    if (input.atingimentoOverride == null && regra.meta_referencia_id) {
      const vKey = String(sale.vendedor_id ?? 'sem-vendedor')
      atingimentoCtx = input.atingimentoPorVendedorPorMeta?.get(vKey)?.get(regra.meta_referencia_id) ?? null
    }

    const ctx: EvalContext = {
      produto:           sale.produto_nome ?? '',
      grupo_produto:     sale.grupo_produto ?? '',
      subgrupo_produto:  sale.subgrupo_produto ?? '',
      vendedor:          sale.vendedor_nome ?? '',
      cargo:             sale.cargo ?? '',
      posto:             String(sale.empresa_id ?? ''),
      faturamento, quantidade, mix: 1, margem,
      atingimento_meta:  atingimentoCtx,
      pontuacao_checklist: null,  // simulação por venda não puxa checklist
    }

    // Regra só casa se passa no escopo da ação E nas condições do SE
    const matched = passaEscopo && evaluateGroup(regra.condicoes, ctx)
    const { valor, breakdown } = calcularComissaoValor(sale, regra)

    const vencedora = matched && vencedoraId === null
    if (vencedora) {
      vencedoraId = regra.id
      comissaoFinal = valor
    }

    resultados.push({
      regra_id:    regra.id,
      regra_nome:  regra.nome,
      prioridade:  regra.prioridade,
      matched,
      vencedora,
      comissao:    valor,
      breakdown,
    })
  }

  return {
    venda:                 sale,
    meta_atribuida:        meta?.id ?? null,
    atingimento_aplicado:  atingimento,
    regras:                resultados,
    vencedora_id:          vencedoraId,
    comissao_final:        comissaoFinal,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ── NOVO MODELO: comissão por vendedor agregado (migration 093) ─────────────
// ═════════════════════════════════════════════════════════════════════════════
//
// Em vez de gerar uma comissão por venda, agora cada par (vendedor × regra
// que casou) gera UMA ComissaoPorRegra. Sem first-match-wins: todas as
// regras que casarem aplicam. Cada regra tem:
//
//   • realizado_filtros + realizado_campo → calcula o realizado da meta
//   • meta_referencia_id                  → fornece valor_meta (atingimento)
//   • condicoes                           → avaliadas no contexto agregado
//   • base_filtros + base_campo           → calcula a base da comissão
//   • resultado_modo + resultado_valor    → aplica modo (sobre/por_unidade/a_cada)

// Agrega um campo de uma lista de vendas. Para 'mix', conta produtos distintos.
// Para 'atingimento_meta' devolve 0 — o valor real é resolvido fora desta
// função (depende da meta_referencia, não das vendas em si). Quem chama
// trata o caso especial antes.
function agregarCampo(vendas: Venda[], campo: RegraCampo): number {
  switch (campo) {
    case 'faturamento':
      return vendas.reduce((s, v) => s + v.valor_total, 0)
    case 'quantidade':
      return vendas.reduce((s, v) => s + v.quantidade, 0)
    case 'lucro':
      return vendas.reduce((s, v) => s + (v.valor_total - v.custo_medio_unitario * v.quantidade), 0)
    case 'mix': {
      const set = new Set<number>()
      for (const v of vendas) set.add(v.produto)
      return set.size
    }
    case 'atingimento_meta':
      // Quem chama precisa interceptar antes — atingimento não vem de soma.
      return 0
  }
}

// Aplica modo/taxa sobre um agregado e devolve a comissão + breakdown.
// Reusa a forma do BreakdownCalculo para compatibilidade com o relatório.
function aplicarModoSobreAgregado(
  regra:    Regra,
  campo:    RegraCampo,
  base:     number,
): { valor: number; breakdown: BreakdownCalculo } {
  const fmtBRL = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
  const fmtNum = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

  const taxa = Number(regra.resultado_valor)
  const modo = regra.resultado_modo

  // Modo 'fixo' — paga taxa em R$ direto, ignorando base. Útil para bônus
  // do tipo "se atingiu meta, ganha R$ 100".
  if (modo === 'fixo') {
    return {
      valor: taxa,
      breakdown: {
        base_valor:     0,
        base_descricao: `${fmtBRL(taxa)} fixo`,
        modo,
        tipo:           regra.resultado_tipo,
        taxa,
        comissao_final: taxa,
      },
    }
  }

  // Texto humano da base — usado no breakdown.base_descricao
  const baseTxt = campo === 'faturamento' || campo === 'lucro'
    ? fmtBRL(base)
    : campo === 'atingimento_meta'
      ? `${fmtNum(base)}% atingido`
      : `${fmtNum(base)} ${campo === 'quantidade' ? 'un.' : 'produto(s)'}`

  if (modo === 'sobre') {
    const valor = (base * taxa) / 100
    return {
      valor,
      breakdown: {
        base_valor:     base,
        base_descricao: `${fmtNum(taxa)}% sobre ${campo} ${baseTxt}`,
        modo,
        tipo:           regra.resultado_tipo,
        taxa,
        comissao_final: valor,
      },
    }
  }

  if (modo === 'por_unidade') {
    // Para faturamento/lucro, "unidade" é R$ 1 — incomum, mas válido.
    // Para quantidade/mix, "unidade" é uma unidade vendida ou produto distinto.
    const valor = base * taxa
    return {
      valor,
      breakdown: {
        base_valor:     base,
        base_descricao: `${fmtBRL(taxa)} × ${baseTxt}`,
        modo,
        tipo:           regra.resultado_tipo,
        taxa,
        comissao_final: valor,
      },
    }
  }

  // a_cada — R$ X a cada R$ Y (ou Y unidades) do agregado da base
  const faixa  = Number(regra.resultado_base_valor) || 0
  const passos = faixa > 0 ? Math.floor(base / faixa) : 0
  const valor  = passos * taxa
  const faixaTxt = campo === 'faturamento' || campo === 'lucro'
    ? fmtBRL(faixa)
    : campo === 'atingimento_meta'
      ? `${fmtNum(faixa)}%`
      : `${fmtNum(faixa)} ${campo === 'quantidade' ? 'un.' : 'produto(s)'}`
  return {
    valor,
    breakdown: {
      base_valor:     base,
      base_descricao: `${fmtBRL(taxa)} × ${passos} faixa(s) de ${faixaTxt}`,
      modo,
      tipo:           regra.resultado_tipo,
      taxa,
      comissao_final: valor,
    },
  }
}

export interface CalcularPorVendedorInput {
  vendas: Venda[]
  regras: Regra[]
  metas:  Meta[]
  /**
   * Mapa atingimento_por_vendedor_por_meta: vendedor_id → meta_id → %.
   * Quando a regra tem meta_referencia_id, este mapa é consultado primeiro
   * (resultado já pré-calculado pelo orchestrator). Se não houver entrada,
   * o engine cai no fallback: realizado/meta.valor_meta × 100.
   */
  atingimentoPorVendedorPorMeta?: Map<string, Map<string, number>>
  /**
   * Mapa atingimento_TOTAL_por_meta: meta_id → % (somando vendas de TODOS
   * os vendedores). Usado quando regra.realizado_escopo === 'todos'.
   * Migration 127.
   */
  atingimentoTotalPorMeta?:       Map<string, number>
  /**
   * Membros do esquema (com external_person_id). Quando passado, o engine
   * GARANTE uma linha de comissão por membro ativo, mesmo que ele não tenha
   * vendas próprias — necessário para gerentes/supervisores que comissionam
   * sobre o realizado/base agregado do posto. Migration 127.
   */
  membros?:                       Membro[]
  /**
   * Mapa pontuacao_checklist_por_template: template_id → soma de total_pontos
   * das aplicações do posto no período. Usado por regras que apontam
   * `checklist_template_referencia_id` para preencher ctx.pontuacao_checklist.
   * Migration 135.
   */
  pontuacaoChecklistPorTemplate?: Map<string, number>
}

export function calcularComissaoPorVendedor(input: CalcularPorVendedorInput): ComissaoPorVendedor[] {
  const regrasAtivas = input.regras
    .filter(r => r.status === 'ativo')
    .slice()
    .sort((a, b) => a.prioridade - b.prioridade)

  // ── Agrupa vendas por vendedor ────────────────────────────────────────────
  const porVendedor = new Map<string, Venda[]>()
  for (const v of input.vendas) {
    const key = String(v.vendedor_id ?? 'sem-vendedor')
    const arr = porVendedor.get(key) ?? []
    arr.push(v)
    porVendedor.set(key, arr)
  }

  // Garante que cada membro ativo com external_person_id tem entrada (mesmo
  // que vazia). Necessário para gerentes que não têm vendas próprias mas
  // recebem comissão sobre o agregado (regras com escopo='todos').
  // Membros sem external_person_id (fora do AUTOSYSTEM) ficam de fora.
  const membroNomePorVendedorKey = new Map<string, string>()
  const membroRolePorVendedorKey = new Map<string, string>()
  if (input.membros) {
    for (const m of input.membros) {
      if (!m.ativo || !m.external_person_id) continue
      const key = m.external_person_id
      if (!porVendedor.has(key)) porVendedor.set(key, [])
      membroNomePorVendedorKey.set(key, m.nome)
      // ctx.cargo no engine usa role do membro (cadastrado no Supabase),
      // não cargo do AUTOSYSTEM — permite que regras "cargo = manager"
      // sigam o role cadastrado aqui mesmo que o AUTOSYSTEM tenha outro
      // valor textual.
      membroRolePorVendedorKey.set(key, m.role)
    }
  }

  // ── Map auxiliar de metas por id ──────────────────────────────────────────
  const metaPorId = new Map<string, Meta>()
  for (const m of input.metas) metaPorId.set(m.id, m)

  const resultado: ComissaoPorVendedor[] = []

  for (const [vKey, vendasDoVendedor] of porVendedor) {
    // Antes só pulava se vazio — agora permite gerentes (sem vendas próprias)
    // entrarem desde que estejam no map (via input.membros). Regras com
    // escopo='vendedor' naturalmente devolvem 0 pra esses membros; regras
    // com escopo='todos' devolvem agregado do posto.
    const semVendas = vendasDoVendedor.length === 0
    if (semVendas && !membroNomePorVendedorKey.has(vKey)) continue

    // Vendedor info — pega da primeira venda quando tiver, senão do membro
    const primeira: Venda | null = vendasDoVendedor[0] ?? null
    const nomeFallback = membroNomePorVendedorKey.get(vKey) ?? '(sem vendedor)'
    const comissoesDoVendedor: ComissaoPorRegra[] = []

    for (const regra of regrasAtivas) {
      // ── 1. Pool de vendas para o REALIZADO (escopo) ──────────────────────
      // 'vendedor': só as vendas desse vendedor. 'todos': vendas do posto.
      const poolRealizado = regra.realizado_escopo === 'todos'
        ? input.vendas
        : vendasDoVendedor
      const vendasRealizado = regra.realizado_filtros.length === 0
        ? poolRealizado
        : poolRealizado.filter(v => vendaPassaProductFilters(v, regra.realizado_filtros))

      // ── 2. Resolve atingimento via meta de referência ────────────────────
      let metaValor:        number | null = null
      let atingimentoMeta:  number | null = null

      if (regra.meta_referencia_id) {
        const meta = metaPorId.get(regra.meta_referencia_id)
        if (meta) {
          metaValor = Number(meta.valor_meta) || 0
          // Quando escopo='todos': puxa do mapa TOTAL (atingimento da meta inteira).
          // Quando escopo='vendedor': puxa do mapa individual; fallback usa o
          // realizado calculado localmente.
          if (regra.realizado_escopo === 'todos') {
            atingimentoMeta = input.atingimentoTotalPorMeta?.get(meta.id) ?? null
          } else {
            const preCalc = input.atingimentoPorVendedorPorMeta?.get(vKey)?.get(meta.id)
            if (preCalc != null) {
              atingimentoMeta = preCalc
            } else if (metaValor > 0 && regra.realizado_campo !== 'atingimento_meta') {
              const realizadoFallback = agregarCampo(vendasRealizado, regra.realizado_campo)
              atingimentoMeta = (realizadoFallback / metaValor) * 100
            }
          }
        }
      }

      // ── 3. Resolve realizadoValor (com caso especial atingimento_meta) ──
      const realizadoValor = regra.realizado_campo === 'atingimento_meta'
        ? (atingimentoMeta ?? 0)
        : agregarCampo(vendasRealizado, regra.realizado_campo)

      // ── 4. Avalia condições do SE no contexto agregado ───────────────────
      const ctx: EvalContext = {
        produto:           '',
        grupo_produto:     '',
        subgrupo_produto:  '',
        vendedor:          primeira?.vendedor_nome ?? nomeFallback,
        // Cargo vem do role cadastrado em Membros (Supabase). Fallback para
        // sale.cargo (AUTOSYSTEM) quando o vendedor não está cadastrado.
        cargo:             membroRolePorVendedorKey.get(vKey) ?? primeira?.cargo ?? '',
        posto:             String(primeira?.empresa_id ?? ''),
        faturamento:       agregarCampo(vendasRealizado, 'faturamento'),
        quantidade:        agregarCampo(vendasRealizado, 'quantidade'),
        mix:               agregarCampo(vendasRealizado, 'mix'),
        margem:            (() => {
          const fat = agregarCampo(vendasRealizado, 'faturamento')
          if (fat <= 0) return 0
          const luc = agregarCampo(vendasRealizado, 'lucro')
          return (luc / fat) * 100
        })(),
        atingimento_meta:  atingimentoMeta,
        pontuacao_checklist: regra.checklist_template_referencia_id
          ? (input.pontuacaoChecklistPorTemplate?.get(regra.checklist_template_referencia_id) ?? null)
          : null,
      }

      if (!evaluateGroup(regra.condicoes, ctx)) continue

      // ── 5. Pool de vendas para a BASE (escopo) ───────────────────────────
      const poolBase = regra.base_escopo === 'todos'
        ? input.vendas
        : vendasDoVendedor
      const vendasBase = regra.base_filtros.length === 0
        ? poolBase
        : poolBase.filter(v => vendaPassaProductFilters(v, regra.base_filtros))
      const baseValor = regra.base_campo === 'atingimento_meta'
        ? (atingimentoMeta ?? 0)
        : agregarCampo(vendasBase, regra.base_campo)

      // ── 5. Aplica modo (sobre/por_unidade/a_cada) ────────────────────────
      const { valor: comissao, breakdown } = aplicarModoSobreAgregado(regra, regra.base_campo, baseValor)

      comissoesDoVendedor.push({
        regra_id:             regra.id,
        regra_nome:           regra.nome,
        prioridade:           regra.prioridade,
        realizado_campo:      regra.realizado_campo,
        realizado_valor:      realizadoValor,
        realizado_qtd_vendas: vendasRealizado.length,
        meta_referencia_id:   regra.meta_referencia_id,
        meta_valor:           metaValor,
        atingimento_meta:     atingimentoMeta,
        base_campo:           regra.base_campo,
        base_valor:           baseValor,
        base_qtd_vendas:      vendasBase.length,
        comissao,
        breakdown,
      })
    }

    // Filtra zerados: se membro sem vendas nem aceitou regra (todas zeram),
    // não inclui no resultado para não poluir o relatório com linhas vazias.
    const totalComissao = comissoesDoVendedor.reduce((s, c) => s + c.comissao, 0)
    if (semVendas && comissoesDoVendedor.length === 0) continue
    resultado.push({
      vendedor_id:    vKey,
      vendedor_nome:  primeira?.vendedor_nome ?? nomeFallback,
      comissoes:      comissoesDoVendedor,
      comissao_total: totalComissao,
    })
  }

  return resultado
}
