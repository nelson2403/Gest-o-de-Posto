// ─────────────────────────────────────────────────────────────────────────────
// Tipos + helpers das condições das regras de comissionamento.
//
// Estrutura serializada no JSONB `comissio_regras.condicoes`:
//
//   {
//     id:       string                  // identificador local p/ React keys
//     logic:    'AND' | 'OR'            // como combinar conditions+groups
//     conditions: Condition[]           // comparações simples
//     groups:   ConditionGroup[]        // sub-grupos (com lógica própria)
//   }
//
// Condition:
//   { id, field, operator, value, value2? }
//
// A árvore é puramente declarativa — o motor de cálculo (quando existir)
// caminha por ela aplicando os operadores. Aqui só editamos e resumimos.
// ─────────────────────────────────────────────────────────────────────────────

export type FieldType = 'number' | 'text'

export type FieldKey =
  | 'faturamento'
  | 'quantidade'
  | 'mix'
  | 'produto'
  | 'grupo_produto'
  | 'subgrupo_produto'
  | 'vendedor'
  | 'cargo'
  | 'posto'
  | 'margem'
  | 'pontuacao_checklist'
  | 'atingimento_meta'

export interface FieldDef {
  label: string
  type:  FieldType
  unit?: string
}

export const FIELD_DEFS: Record<FieldKey, FieldDef> = {
  faturamento:       { label: 'Faturamento',         type: 'number', unit: 'R$'  },
  quantidade:        { label: 'Quantidade',          type: 'number', unit: 'un.' },
  mix:               { label: 'Mix',                 type: 'number', unit: 'un.' },
  produto:           { label: 'Produto',             type: 'text'                },
  grupo_produto:     { label: 'Grupo de Produto',    type: 'text'                },
  subgrupo_produto:  { label: 'Subgrupo de Produto', type: 'text'                },
  vendedor:          { label: 'Vendedor',            type: 'text'                },
  cargo:             { label: 'Cargo',               type: 'text'                },
  posto:             { label: 'Posto',               type: 'text'                },
  margem:              { label: 'Margem',                type: 'number', unit: '%'   },
  pontuacao_checklist: { label: 'Pontuação do checklist', type: 'number', unit: 'pts' },
  atingimento_meta:    { label: 'Atingimento de meta',   type: 'number', unit: '%'   },
}

export const FIELD_KEYS = Object.keys(FIELD_DEFS) as FieldKey[]

export type OperatorKey =
  | 'eq' | 'neq'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'between'
  | 'contains' | 'not_contains' | 'starts_with'
  | 'in' | 'not_in'

export interface OperatorDef {
  label:   string  // descrição completa no dropdown
  symbol:  string  // forma compacta usada no resumo / chip
  types:   FieldType[]
  needs:   1 | 2  // qtd de valores (between usa 2; in/not_in usa 1 lista CSV)
}

export const OPERATOR_DEFS: Record<OperatorKey, OperatorDef> = {
  eq:           { label: 'Igual a',         symbol: '=',          types: ['number','text'], needs: 1 },
  neq:          { label: 'Diferente de',    symbol: '≠',          types: ['number','text'], needs: 1 },
  gt:           { label: 'Maior que',       symbol: '>',          types: ['number'],         needs: 1 },
  gte:          { label: 'Maior ou igual',  symbol: '≥',          types: ['number'],         needs: 1 },
  lt:           { label: 'Menor que',       symbol: '<',          types: ['number'],         needs: 1 },
  lte:          { label: 'Menor ou igual',  symbol: '≤',          types: ['number'],         needs: 1 },
  between:      { label: 'Entre',           symbol: 'entre',      types: ['number'],         needs: 2 },
  contains:     { label: 'Contém',          symbol: 'contém',     types: ['text'],           needs: 1 },
  not_contains: { label: 'Não contém',      symbol: 'não contém', types: ['text'],           needs: 1 },
  starts_with:  { label: 'Começa com',      symbol: 'começa com', types: ['text'],           needs: 1 },
  in:           { label: 'Em (lista)',      symbol: 'em',         types: ['number','text'], needs: 1 },
  not_in:       { label: 'Fora de (lista)', symbol: 'fora de',    types: ['number','text'], needs: 1 },
}

export function operatorsFor(field: FieldKey | null): OperatorKey[] {
  if (!field) return Object.keys(OPERATOR_DEFS) as OperatorKey[]
  const t = FIELD_DEFS[field].type
  return (Object.keys(OPERATOR_DEFS) as OperatorKey[]).filter(k => OPERATOR_DEFS[k].types.includes(t))
}

// ── Modelo ───────────────────────────────────────────────────────────────────

export type LogicOperator = 'AND' | 'OR'

export interface Condition {
  id:       string
  field:    FieldKey  | null
  operator: OperatorKey | null
  value:    string | number | null
  value2?:  string | number | null
}

export interface ConditionGroup {
  id:         string
  logic:      LogicOperator
  conditions: Condition[]
  groups:     ConditionGroup[]
}

// ── Fabricantes ──────────────────────────────────────────────────────────────

let _counter = 0
const nid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${(++_counter).toString(36)}`

export function newCondition(): Condition {
  return { id: nid('c'), field: null, operator: null, value: null, value2: null }
}

export function newGroup(logic: LogicOperator = 'AND'): ConditionGroup {
  return { id: nid('g'), logic, conditions: [], groups: [] }
}

// Árvore raiz padrão de uma regra recém-criada (sem condições — aplica sempre).
export function emptyRootGroup(): ConditionGroup {
  return newGroup('AND')
}

// ── Parsing seguro a partir do JSONB ─────────────────────────────────────────
// Garante que estamos lidando com um objeto bem-formado, completando defaults
// faltantes. Aceita o caso especial `{}` (rule recém-criada antes do builder).

export function parseCondicoes(raw: unknown): ConditionGroup {
  if (!raw || typeof raw !== 'object') return emptyRootGroup()
  const obj = raw as Record<string, unknown>
  // root mínimo: { logic, conditions, groups }
  if (!('logic' in obj) && !('conditions' in obj) && !('groups' in obj)) {
    return emptyRootGroup()
  }
  return normalizeGroup(obj as Partial<ConditionGroup>)
}

function normalizeGroup(g: Partial<ConditionGroup>): ConditionGroup {
  return {
    id:    typeof g.id === 'string' ? g.id : nid('g'),
    logic: g.logic === 'OR' ? 'OR' : 'AND',
    conditions: Array.isArray(g.conditions) ? g.conditions.map(normalizeCondition) : [],
    groups:     Array.isArray(g.groups)     ? g.groups.map(normalizeGroup)         : [],
  }
}

function normalizeCondition(c: Partial<Condition>): Condition {
  const field    = (c.field    && c.field    in FIELD_DEFS)    ? c.field    : null
  const operator = (c.operator && c.operator in OPERATOR_DEFS) ? c.operator : null
  return {
    id:       typeof c.id === 'string' ? c.id : nid('c'),
    field,
    operator,
    value:    c.value  ?? null,
    value2:   c.value2 ?? null,
  }
}

// ── Resumo legível ───────────────────────────────────────────────────────────
// Converte a árvore em algo como:
//   "Faturamento ≥ R$ 1.000 E (Produto = Gasolina Comum OU Grupo ≠ Conveniência)"

export function isGroupEmpty(g: ConditionGroup): boolean {
  return g.conditions.length === 0 && g.groups.length === 0
}

function fmtNumber(v: unknown, unit?: string): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v ?? '')
  if (unit === 'R$') return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  if (unit === '%')  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
  return `${n.toLocaleString('pt-BR')}${unit ? ' ' + unit : ''}`
}

function fmtValue(c: Condition): string {
  if (c.field == null) return '?'
  const def = FIELD_DEFS[c.field]
  if (def.type === 'number') return fmtNumber(c.value, def.unit)
  if (c.value == null || c.value === '') return '"?"'
  return `"${c.value}"`
}

export function summarizeCondition(c: Condition): string {
  if (c.field == null || c.operator == null) return '(condição incompleta)'
  const def    = FIELD_DEFS[c.field]
  const opDef  = OPERATOR_DEFS[c.operator]
  if (c.operator === 'between') {
    const v1 = fmtNumber(c.value,  def.unit)
    const v2 = fmtNumber(c.value2, def.unit)
    return `${def.label} entre ${v1} e ${v2}`
  }
  return `${def.label} ${opDef.symbol} ${fmtValue(c)}`
}

export function summarizeGroup(g: ConditionGroup, isRoot = true): string {
  const partes: string[] = []
  for (const c of g.conditions) partes.push(summarizeCondition(c))
  for (const sg of g.groups) {
    if (isGroupEmpty(sg)) continue
    partes.push(summarizeGroup(sg, false))
  }
  if (partes.length === 0) return ''
  const join = g.logic === 'AND' ? ' E ' : ' OU '
  const out  = partes.join(join)
  return isRoot || partes.length === 1 ? out : `(${out})`
}

// Validação básica — usada pra impedir salvar com condições incompletas.
export function hasIncomplete(g: ConditionGroup): boolean {
  for (const c of g.conditions) {
    if (c.field == null || c.operator == null) return true
    const opDef = OPERATOR_DEFS[c.operator]
    if (c.value == null || c.value === '') return true
    if (opDef.needs === 2 && (c.value2 == null || c.value2 === '')) return true
  }
  for (const sg of g.groups) {
    if (hasIncomplete(sg)) return true
  }
  return false
}
