// ─────────────────────────────────────────────────────────────────────────────
// Tipos puros do domínio de comissionamento.
//
// Espelham as colunas do banco (comissio_esquemas / comissio_regras /
// comissio_membros / comissio_metas / comissio_metas_splits) numa forma
// conveniente para o motor de cálculo. Nenhuma dependência de runtime — esse
// arquivo pode ser importado tanto no servidor quanto no cliente.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  FieldKey, OperatorKey, ConditionGroup,
} from '@/app/(dashboard)/comissionamento/_lib/conditions'

export type { FieldKey, OperatorKey, ConditionGroup }

// ── Modo / base do "ENTÃO faça isso" ────────────────────────────────────────
export type ResultadoModo = 'sobre' | 'por_unidade' | 'a_cada' | 'fixo'
export type ResultadoTipo =
  | 'vendas_rs'         // Faturamento
  | 'lucro_bruto'       // Lucro bruto (venda - custo)
  | 'quantidade'
  | 'mix'
  | 'produto'
  | 'grupo_produto'
  | 'subgrupo_produto'

export type RegraStatus    = 'rascunho' | 'ativo' | 'inativo'
export type EsquemaStatus  = 'rascunho' | 'ativo' | 'inativo'

// ── Filtro de produto a nível de esquema ────────────────────────────────────
//
// Restringe o escopo do esquema a um subset de vendas. Múltiplos filtros
// combinam por AND. Vendas que não passam pelo filtro do esquema NÃO entram
// na avaliação das regras (saem com comissão zero).
export type ProductFilterTipo = 'produto' | 'grupo_produto' | 'subgrupo_produto' | 'produto_tipo'
export type ProductFilterModo = 'incluir' | 'excluir'

export interface ProductFilter {
  tipo:    ProductFilterTipo
  valores: string[]
  modo:    ProductFilterModo
}

export interface Esquema {
  id:               string
  nome:             string
  status:           EsquemaStatus
  product_filters:  ProductFilter[]
}

// ── Escopo da AÇÃO (ENTÃO) — LEGADO ─────────────────────────────────────────
// Mantido no tipo apenas por compatibilidade com regras antigas no banco.
// O engine NOVO (calcularComissaoPorVendedor) ignora estes campos — quem
// cumpre o papel agora é `base_filtros`. Migration 093 fez o backfill.
export type EscopoRegraTipo = 'produto' | 'grupo_produto' | 'subgrupo_produto'

// ── Campo somado nos cálculos de realizado/base ─────────────────────────────
//   faturamento       = Σ valor_total
//   quantidade        = Σ quantidade
//   lucro             = Σ (valor_total − custo_medio_unitario × quantidade)
//   mix               = nº de produtos distintos no conjunto filtrado
//   atingimento_meta  = % atingido da meta_referencia (não agrega vendas;
//                       ignora os filtros e puxa direto do mapa pré-calculado).
//                       Útil para o ENTÃO em modo por_unidade ou a_cada.
export type RegraCampo = 'faturamento' | 'quantidade' | 'lucro' | 'mix' | 'atingimento_meta'

// Escopo dos filtros (migration 127). Define se o agregado é calculado
// sobre as vendas do vendedor sendo processado ('vendedor') ou sobre TODAS
// as vendas do posto ('todos'). 'todos' resolve regras de gerente.
export type RegraEscopo = 'vendedor' | 'todos'

// ── Regra normalizada para o motor ──────────────────────────────────────────
export interface Regra {
  id:                   string
  esquema_id:           string
  nome:                 string
  status:               RegraStatus
  prioridade:           number
  condicoes:            ConditionGroup
  resultado_modo:       ResultadoModo
  resultado_tipo:       ResultadoTipo
  resultado_valor:      number
  resultado_base_valor: number
  escopo_tipo:          EscopoRegraTipo | null  // legado — ver migration 093
  escopo_valor:         string                  // legado — ver migration 093
  // Meta de referência opcional para a condição `atingimento_meta`. Quando
  // preenchida, o engine usa o atingimento DESSA meta no contexto, em vez
  // do atingimento da meta atribuída à venda. Resolve casos onde a meta
  // (com filtros) NÃO cobre as vendas que devem ser comissionadas.
  meta_referencia_id:   string | null

  // Referência DINÂMICA por nome: quando meta_referencia_id é null e este
  // campo está preenchido, o engine procura no momento do cálculo uma meta
  // com este nome (case-insensitive) no posto atual cujo período cruze o
  // intervalo do cálculo. Permite que a mesma regra funcione em vários
  // meses sem precisar duplicar toda vez que a meta é renovada.
  meta_referencia_nome: string | null

  // Template do checklist para a condição `pontuacao_checklist`. Quando
  // preenchido, o engine soma total_pontos das aplicações desse template
  // que cruzam o período do cálculo (no posto atual) e coloca no ctx
  // como pontuacao_checklist. Sem esse campo a condição sempre bate zero.
  checklist_template_referencia_id: string | null

  // ── Novo modelo "por vendedor agregado" (migration 093) ─────────────────
  // SE — filtros e dimensão que definem o realizado da meta de referência.
  // Múltiplos filtros combinam por AND. Vazio = todas as vendas do vendedor.
  realizado_filtros:    ProductFilter[]
  realizado_campo:      RegraCampo
  // ENTÃO — filtros e dimensão que definem a base do cálculo da comissão.
  // Vazio = base é o agregado de TODAS as vendas do vendedor.
  base_filtros:         ProductFilter[]
  base_campo:           RegraCampo
  // Escopo de agregação (migration 127). 'vendedor' = como hoje;
  // 'todos' = agrega sobre o posto inteiro (regras de gerente).
  realizado_escopo:     RegraEscopo
  base_escopo:          RegraEscopo
}

// ── Membro do comissionamento (vendedor / gerente / etc.) ───────────────────
export type MembroRole = 'supervisor' | 'manager' | 'pit_boss' | 'oil_changer' | 'seller'

export interface Membro {
  id:                  string
  posto_id:            string
  external_person_id:  string | null  // pessoa.grid no AUTOSYSTEM
  nome:                string
  role:                MembroRole
  ativo:               boolean
}

// ── Meta + split (distribuição da meta entre membros) ───────────────────────
// markup = lucro / custo × 100 (marcação sobre o custo). Diferente de
// margem, que é lucro / faturamento × 100.
// checklist = pontuação obtida numa aplicação mensal do supervisor
// sobre um template de checklist (limpeza, uniforme, etc.). Não vem
// das vendas — é entrada manual. Ver comissio_checklists_*.
export type MetaCampo  = 'faturamento' | 'quantidade' | 'margem' | 'mix' | 'markup' | 'checklist'
export type MetaFiltro = 'produto' | 'grupo_produto' | 'subgrupo_produto' | 'produto_tipo'
export type MetaModo   = 'incluir' | 'excluir'

// Um filtro de meta. Múltiplos filtros são combinados por AND — todos
// precisam casar (ou todos precisam NÃO casar, no caso modo='excluir')
// para a venda contar no realizado.
export interface MetaFiltroRegra {
  tipo:    MetaFiltro
  valores: string[]
  modo:    MetaModo
}

export interface Meta {
  id:              string
  posto_id:        string
  grupo_id:        string | null
  nome:            string
  campo:           MetaCampo
  // Lista de filtros (AND). Vazio → conta todas as vendas do posto/período.
  filtros:         MetaFiltroRegra[]
  // Campos legados (single-filter) — preservados para retrocompatibilidade
  // de leitura. O engine usa exclusivamente `filtros`.
  filtro_tipo:     MetaFiltro | null
  filtro_valores:  string[] | null
  filtro_modo:     MetaModo
  // Configuração específica para campo='mix' — participação relativa.
  // Realizado(mix) = soma quantidades dos produtos do numerador / soma
  // quantidades dos produtos do denominador × 100. Para outros `campo`,
  // ambos ficam null.
  //
  // Resolução: o data-loader prefere as categorias (mix_*_categoria_id) e
  // resolve a lista de produtos via comissio_categoria_produtos. Quando
  // não há categoria vinculada, cai em `mix_*` (legado: nomes literais).
  mix_numerador_categoria_id:   string | null
  mix_denominador_categoria_id: string | null
  // Grids dos produtos (vindos de comissio_categoria_produtos.produto_grid).
  // Preferidos pelo engine: comparam Venda.produto (grid) direto, sem casar
  // por string — robusto contra variação de nome ("GASOLINA C COMUM" vs
  // "Gasolina Comum"). Populados quando há categoria_id; null no legado.
  mix_numerador_grids:   number[] | null
  mix_denominador_grids: number[] | null
  // Nomes (legado pré-categoria). Usados como fallback quando os grids são
  // null. Preservados também para exibição no diagnóstico.
  mix_numerador:   string[] | null
  mix_denominador: string[] | null
  // Meta de campo='checklist' aponta para o template. O realizado é
  // resolvido no data-loader: pega a aplicação (posto × template) que
  // cruza o período da meta e usa o total_pontos como realizado.
  checklist_template_id: string | null
  valor_meta:      number   // total da empresa/posto (ou pontos-alvo p/ checklist)
  period_start:    string   // YYYY-MM-DD
  period_end:      string   // YYYY-MM-DD
}

// ── Checklist mensal aplicado pelo supervisor ─────────────────────────────
export interface ChecklistTemplate {
  id:         string
  nome:       string
  descricao:  string
  ativo:      boolean
  itens:      ChecklistItem[]
}

export interface ChecklistItem {
  id:         string
  ordem:      number
  descricao:  string
  pontos:     number
}

export interface ChecklistAplicacao {
  id:           string
  template_id:  string
  posto_id:     string
  period_start: string
  period_end:   string
  total_pontos: number
  observacoes:  string
  respostas:    ChecklistResposta[]
}

export interface ChecklistResposta {
  aplicacao_id: string
  item_id:      string
  ok:           boolean
  motivo:       string
}

export interface MetaSplit {
  meta_id:    string
  membro_id:  string
  valor_meta: number  // meta individual deste membro
}

// ── Venda (linha de lancto enriquecida) ─────────────────────────────────────
//
// Esse é o formato que o motor consome. Reflete `VendaParaComissionamento`
// do autosystem.ts mas vive aqui para o engine ser auto-contido.
export interface Venda {
  grid:                  number
  empresa_id:            number
  data:                  string   // YYYY-MM-DD
  vendedor_id:           number | null  // pessoa.grid
  vendedor_nome:         string | null
  cargo:                 string | null
  produto:               number
  produto_nome:          string
  produto_tipo:          string | null
  grupo_produto:         string | null
  subgrupo_produto:      string | null
  quantidade:            number
  valor_total:           number
  custo_medio_unitario:  number
}

// ── Resultado do cálculo ────────────────────────────────────────────────────
export interface BreakdownCalculo {
  base_valor:      number   // valor sobre o qual a comissão foi aplicada
  base_descricao:  string   // "5% sobre R$ 1.234,56" etc.
  modo:            ResultadoModo
  tipo:            ResultadoTipo
  taxa:            number   // resultado_valor da regra
  comissao_final:  number
}

export interface VendaComissionada {
  venda:             Venda
  regra_id:          string | null   // null se nenhuma regra casou
  regra_nome:        string | null
  comissao:          number          // 0 se sem match
  meta_atribuida:    string | null   // id da meta que cobre essa venda
  breakdown:         BreakdownCalculo | null
}

// ── Modelo novo: comissão por vendedor agregado (migration 093) ─────────────
// Cada par (vendedor × regra que casou) gera uma ComissaoPorRegra. O total
// por vendedor é a soma sem first-match-wins — todas as regras que casarem
// aplicam.

export interface ComissaoPorRegra {
  regra_id:             string
  regra_nome:           string
  prioridade:           number

  // SE — avaliação
  realizado_campo:      RegraCampo
  realizado_valor:      number             // agregado depois dos realizado_filtros
  realizado_qtd_vendas: number             // # de vendas que passaram no filtro
  meta_referencia_id:   string | null
  meta_valor:           number | null      // valor_meta da meta de referência (null se sem ref)
  atingimento_meta:     number | null      // realizado / meta × 100 (null se sem meta)

  // ENTÃO — cálculo
  base_campo:           RegraCampo
  base_valor:           number             // agregado depois dos base_filtros
  base_qtd_vendas:      number             // # de vendas que entraram na base
  comissao:             number
  breakdown:            BreakdownCalculo
}

export interface ComissaoPorVendedor {
  vendedor_id:    string                   // "sem-vendedor" quando pessoa.grid é null
  vendedor_nome:  string
  comissoes:      ComissaoPorRegra[]
  comissao_total: number                   // Σ das comissões
}

// ── Atingimento de meta por vendedor ────────────────────────────────────────
export interface AtingimentoMeta {
  meta_id:        string
  meta_nome:      string
  campo:          MetaCampo
  membro_id:      string
  vendedor_id:    string         // pessoa.grid (externalId)
  meta_individual: number
  realizado:      number
  atingimento:    number         // % (realizado/meta * 100)
  period_start:   string
  period_end:     string
}

// ── Resultado agregado por vendedor ─────────────────────────────────────────
export interface ResumoVendedor {
  vendedor_id:    string   // pessoa.grid
  vendedor_nome:  string
  membro_id:      string | null
  // Role do membro cadastrado no Supabase — null se o vendedor tem vendas
  // mas não está cadastrado como membro do posto.
  membro_role:    MembroRole | null
  vendas_count:   number
  quantidade:     number
  faturamento:    number
  custo:          number
  lucro_bruto:    number
  margem:         number   // (lucro/faturamento) * 100
  comissao_total: number
  atingimentos:   AtingimentoMeta[]
}
