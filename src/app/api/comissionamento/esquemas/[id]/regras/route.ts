import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type RegraStatus = 'rascunho' | 'ativo' | 'inativo'

// Base categórica usada quando o modo é 'sobre' (qual variável a regra olha).
// A UI atualmente expõe apenas `vendas_rs` e `lucro_bruto` — os demais
// permanecem aceitos pelo banco por compatibilidade com regras antigas.
export type ResultadoTipo =
  | 'vendas_rs'         // Faturamento
  | 'lucro_bruto'       // Lucro Bruto
  | 'quantidade'
  | 'mix'
  | 'produto'
  | 'grupo_produto'
  | 'subgrupo_produto'

// Modo do "ENTÃO faça isso": como o valor é aplicado.
export type ResultadoModo =
  | 'sobre'         // % sobre uma base categórica
  | 'por_unidade'   // R$ por unidade vendida
  | 'a_cada'        // R$ a cada N R$ de base (faixa)
  | 'fixo'          // R$ valor fixo (ignora base, paga taxa direto)

// Escopo opcional na ação — restringe quais vendas a regra alcança (legado).
export type EscopoTipo = 'produto' | 'grupo_produto' | 'subgrupo_produto'

// Campo somado no realizado/base do novo engine (migration 093 + 094).
// 'atingimento_meta' é especial — vem direto do mapa de atingimentos.
export type RegraCampo = 'faturamento' | 'quantidade' | 'lucro' | 'mix' | 'atingimento_meta'

// Escopo da agregação (migration 127). 'vendedor' = comportamento atual;
// 'todos' = agrega sobre o posto inteiro (regras de gerente).
export type RegraEscopoApi = 'vendedor' | 'todos'

const STATUS_VALIDOS: readonly RegraStatus[]   = ['rascunho', 'ativo', 'inativo']
const TIPOS_VALIDOS:  readonly ResultadoTipo[] = [
  'vendas_rs', 'lucro_bruto', 'quantidade', 'mix', 'produto', 'grupo_produto', 'subgrupo_produto',
]
const MODOS_VALIDOS:  readonly ResultadoModo[] = ['sobre', 'por_unidade', 'a_cada', 'fixo']
const ESCOPO_VALIDOS: readonly EscopoTipo[]    = ['produto', 'grupo_produto', 'subgrupo_produto']
const CAMPOS_VALIDOS: readonly RegraCampo[]    = ['faturamento', 'quantidade', 'lucro', 'mix', 'atingimento_meta']
const ESCOPOS_VALIDOS: readonly RegraEscopoApi[] = ['vendedor', 'todos']

// ─── POST — cria nova regra dentro do esquema ───────────────────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: esquemaId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Partial<{
    nome:                  string
    descricao:             string
    status:                RegraStatus
    prioridade:            number
    condicoes:             unknown
    resultado_tipo:        ResultadoTipo
    resultado_modo:        ResultadoModo
    resultado_valor:       number
    resultado_base_valor:  number
    escopo_tipo:           EscopoTipo | null
    escopo_valor:          string
    meta_referencia_id:    string | null
    meta_referencia_nome:  string | null
    checklist_template_referencia_id: string | null
    realizado_filtros:     unknown[]
    realizado_campo:       RegraCampo
    base_filtros:          unknown[]
    base_campo:            RegraCampo
    realizado_escopo:      RegraEscopoApi
    base_escopo:           RegraEscopoApi
  }>

  if (!body.nome?.trim()) {
    return NextResponse.json({ error: 'nome é obrigatório' }, { status: 400 })
  }
  if (body.status && !STATUS_VALIDOS.includes(body.status)) {
    return NextResponse.json({ error: `status inválido — use ${STATUS_VALIDOS.join(', ')}` }, { status: 400 })
  }
  if (body.resultado_tipo && !TIPOS_VALIDOS.includes(body.resultado_tipo)) {
    return NextResponse.json({ error: `resultado_tipo inválido — use ${TIPOS_VALIDOS.join(', ')}` }, { status: 400 })
  }
  if (body.resultado_modo && !MODOS_VALIDOS.includes(body.resultado_modo)) {
    return NextResponse.json({ error: `resultado_modo inválido — use ${MODOS_VALIDOS.join(', ')}` }, { status: 400 })
  }
  if (body.escopo_tipo != null && !ESCOPO_VALIDOS.includes(body.escopo_tipo)) {
    return NextResponse.json({ error: `escopo_tipo inválido — use ${ESCOPO_VALIDOS.join(', ')}` }, { status: 400 })
  }
  if (body.realizado_campo && !CAMPOS_VALIDOS.includes(body.realizado_campo)) {
    return NextResponse.json({ error: `realizado_campo inválido — use ${CAMPOS_VALIDOS.join(', ')}` }, { status: 400 })
  }
  if (body.base_campo && !CAMPOS_VALIDOS.includes(body.base_campo)) {
    return NextResponse.json({ error: `base_campo inválido — use ${CAMPOS_VALIDOS.join(', ')}` }, { status: 400 })
  }
  if (body.realizado_escopo && !ESCOPOS_VALIDOS.includes(body.realizado_escopo)) {
    return NextResponse.json({ error: `realizado_escopo inválido — use ${ESCOPOS_VALIDOS.join(', ')}` }, { status: 400 })
  }
  if (body.base_escopo && !ESCOPOS_VALIDOS.includes(body.base_escopo)) {
    return NextResponse.json({ error: `base_escopo inválido — use ${ESCOPOS_VALIDOS.join(', ')}` }, { status: 400 })
  }
  if (body.realizado_filtros !== undefined && !Array.isArray(body.realizado_filtros)) {
    return NextResponse.json({ error: 'realizado_filtros deve ser um array' }, { status: 400 })
  }
  if (body.base_filtros !== undefined && !Array.isArray(body.base_filtros)) {
    return NextResponse.json({ error: 'base_filtros deve ser um array' }, { status: 400 })
  }

  // Verifica se o esquema existe
  const admin = createAdminClient()
  const { data: esq, error: erEsq } = await admin
    .from('comissio_esquemas')
    .select('id')
    .eq('id', esquemaId)
    .single()
  if (erEsq || !esq) {
    return NextResponse.json({ error: 'Esquema não encontrado' }, { status: 404 })
  }

  const { data, error } = await admin
    .from('comissio_regras')
    .insert({
      esquema_id:            esquemaId,
      nome:                  body.nome.trim(),
      descricao:             body.descricao?.trim() ?? '',
      status:                body.status ?? 'rascunho',
      prioridade:            body.prioridade ?? 1,
      condicoes:             body.condicoes ?? {},
      resultado_tipo:        body.resultado_tipo  ?? 'vendas_rs',
      resultado_modo:        body.resultado_modo  ?? 'sobre',
      resultado_valor:       Number(body.resultado_valor      ?? 0),
      resultado_base_valor:  Number(body.resultado_base_valor ?? 0),
      escopo_tipo:           body.escopo_tipo ?? null,
      escopo_valor:          String(body.escopo_valor ?? '').trim(),
      meta_referencia_id:    body.meta_referencia_id ?? null,
      meta_referencia_nome:  body.meta_referencia_nome?.trim() || null,
      checklist_template_referencia_id: body.checklist_template_referencia_id ?? null,
      realizado_filtros:     Array.isArray(body.realizado_filtros) ? body.realizado_filtros : [],
      realizado_campo:       body.realizado_campo ?? 'faturamento',
      base_filtros:          Array.isArray(body.base_filtros) ? body.base_filtros : [],
      base_campo:            body.base_campo ?? 'faturamento',
      realizado_escopo:      body.realizado_escopo ?? 'vendedor',
      base_escopo:           body.base_escopo ?? 'vendedor',
      criado_por:            user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ regra: data })
}
