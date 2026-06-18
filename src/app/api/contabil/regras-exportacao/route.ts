import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const CAMPOS_COND  = ['conta_debitar','conta_creditar','observacao','documento','pessoa'] as const
const OPERADORES   = ['starts_with','not_starts_with','equals','not_equals','contains','not_contains'] as const
const CAMPOS_ACAO  = ['conta_debitar','conta_creditar','observacao'] as const

type CampoCond = (typeof CAMPOS_COND)[number]
type Operador  = (typeof OPERADORES)[number]
type CampoAcao = (typeof CAMPOS_ACAO)[number]

function validar(body: Record<string, unknown>) {
  const nome              = String(body.nome ?? '').trim()
  const descricao         = String(body.descricao ?? '').trim()
  const ativa             = body.ativa === undefined ? true : Boolean(body.ativa)
  const ordem             = Number.isFinite(Number(body.ordem)) ? Number(body.ordem) : 0
  const condicao_campo    = String(body.condicao_campo ?? '') as CampoCond
  const condicao_operador = String(body.condicao_operador ?? '') as Operador
  const condicao_valor    = String(body.condicao_valor ?? '')
  const acao_campo        = String(body.acao_campo ?? '') as CampoAcao
  const acao_valor        = String(body.acao_valor ?? '').trim()

  if (!nome)                                          return 'nome é obrigatório'
  if (!CAMPOS_COND.includes(condicao_campo))          return `condicao_campo inválido (use ${CAMPOS_COND.join(', ')})`
  if (!OPERADORES.includes(condicao_operador))        return `condicao_operador inválido`
  if (!condicao_valor)                                return 'condicao_valor é obrigatório'
  if (!CAMPOS_ACAO.includes(acao_campo))              return `acao_campo inválido (use ${CAMPOS_ACAO.join(', ')})`
  if (!acao_valor)                                    return 'acao_valor é obrigatório'

  return null
}

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('contabil_regras_exportacao')
    .select('*')
    .order('ordem', { ascending: true })
    .order('criado_em', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ regras: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const erVal = validar(body)
  if (erVal) return NextResponse.json({ error: erVal }, { status: 400 })

  // Se não veio ordem, coloca no final
  let ordem = Number(body.ordem)
  if (!Number.isFinite(ordem)) {
    const { data: maxRow } = await supabase
      .from('contabil_regras_exportacao')
      .select('ordem')
      .order('ordem', { ascending: false })
      .limit(1)
      .maybeSingle()
    ordem = (maxRow?.ordem ?? -1) + 1
  }

  const { data, error } = await supabase
    .from('contabil_regras_exportacao')
    .insert({
      nome:              String(body.nome).trim(),
      descricao:         String(body.descricao ?? '').trim(),
      ativa:             body.ativa === undefined ? true : Boolean(body.ativa),
      ordem,
      condicao_campo:    body.condicao_campo,
      condicao_operador: body.condicao_operador,
      condicao_valor:    String(body.condicao_valor),
      acao_campo:        body.acao_campo,
      acao_valor:        String(body.acao_valor).trim(),
      criado_por:        user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ regra: data })
}
