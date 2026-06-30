import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  RegraStatus, ResultadoTipo, ResultadoModo, EscopoTipo, RegraCampo, RegraEscopoApi,
} from '../../esquemas/[id]/regras/route'

const STATUS_VALIDOS: readonly RegraStatus[]   = ['rascunho', 'ativo', 'inativo']
const TIPOS_VALIDOS:  readonly ResultadoTipo[] = [
  'vendas_rs', 'lucro_bruto', 'quantidade', 'mix', 'produto', 'grupo_produto', 'subgrupo_produto',
]
const MODOS_VALIDOS:  readonly ResultadoModo[] = ['sobre', 'por_unidade', 'a_cada', 'fixo']
const ESCOPO_VALIDOS: readonly EscopoTipo[]    = ['produto', 'grupo_produto', 'subgrupo_produto']
const CAMPOS_VALIDOS: readonly RegraCampo[]    = ['faturamento', 'quantidade', 'lucro', 'mix', 'atingimento_meta']
const ESCOPOS_VALIDOS: readonly RegraEscopoApi[] = ['vendedor', 'todos']

// ─── PATCH ───────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
    realizado_filtros:     unknown[]
    realizado_campo:       RegraCampo
    base_filtros:          unknown[]
    base_campo:            RegraCampo
    realizado_escopo:      RegraEscopoApi
    base_escopo:           RegraEscopoApi
  }>

  if (body.status && !STATUS_VALIDOS.includes(body.status)) {
    return NextResponse.json({ error: `status inválido` }, { status: 400 })
  }
  if (body.resultado_tipo && !TIPOS_VALIDOS.includes(body.resultado_tipo)) {
    return NextResponse.json({ error: `resultado_tipo inválido` }, { status: 400 })
  }
  if (body.resultado_modo && !MODOS_VALIDOS.includes(body.resultado_modo)) {
    return NextResponse.json({ error: `resultado_modo inválido` }, { status: 400 })
  }
  if (body.escopo_tipo != null && !ESCOPO_VALIDOS.includes(body.escopo_tipo)) {
    return NextResponse.json({ error: `escopo_tipo inválido` }, { status: 400 })
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

  const updates: Record<string, unknown> = {}
  if (body.nome                 !== undefined) updates.nome                 = body.nome.trim()
  if (body.descricao            !== undefined) updates.descricao            = body.descricao.trim()
  if (body.status               !== undefined) updates.status               = body.status
  if (body.prioridade           !== undefined) updates.prioridade           = body.prioridade
  if (body.condicoes            !== undefined) updates.condicoes            = body.condicoes
  if (body.resultado_tipo       !== undefined) updates.resultado_tipo       = body.resultado_tipo
  if (body.resultado_modo       !== undefined) updates.resultado_modo       = body.resultado_modo
  if (body.resultado_valor      !== undefined) updates.resultado_valor      = Number(body.resultado_valor)
  if (body.resultado_base_valor !== undefined) updates.resultado_base_valor = Number(body.resultado_base_valor)
  if (body.escopo_tipo          !== undefined) updates.escopo_tipo          = body.escopo_tipo
  if (body.escopo_valor         !== undefined) updates.escopo_valor         = String(body.escopo_valor).trim()
  if (body.meta_referencia_id   !== undefined) updates.meta_referencia_id   = body.meta_referencia_id || null
  if (body.realizado_filtros    !== undefined) updates.realizado_filtros    = Array.isArray(body.realizado_filtros) ? body.realizado_filtros : []
  if (body.realizado_campo      !== undefined) updates.realizado_campo      = body.realizado_campo
  if (body.base_filtros         !== undefined) updates.base_filtros         = Array.isArray(body.base_filtros) ? body.base_filtros : []
  if (body.base_campo           !== undefined) updates.base_campo           = body.base_campo
  if (body.realizado_escopo     !== undefined) updates.realizado_escopo     = body.realizado_escopo
  if (body.base_escopo          !== undefined) updates.base_escopo          = body.base_escopo

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('comissio_regras')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ regra: data })
}

// ─── DELETE ──────────────────────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { error } = await admin.from('comissio_regras').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
