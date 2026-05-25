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

const STATUS_VALIDOS: readonly RegraStatus[]   = ['rascunho', 'ativo', 'inativo']
const TIPOS_VALIDOS:  readonly ResultadoTipo[] = [
  'vendas_rs', 'lucro_bruto', 'quantidade', 'mix', 'produto', 'grupo_produto', 'subgrupo_produto',
]
const MODOS_VALIDOS:  readonly ResultadoModo[] = ['sobre', 'por_unidade', 'a_cada']

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
      criado_por:            user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ regra: data })
}
