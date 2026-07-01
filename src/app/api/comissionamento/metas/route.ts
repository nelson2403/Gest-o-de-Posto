import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type MetaCampo  = 'faturamento' | 'quantidade' | 'margem' | 'mix' | 'markup' | 'checklist'
export type MetaFiltro = 'produto' | 'grupo_produto' | 'subgrupo_produto' | 'produto_tipo'
export type MetaModo   = 'incluir' | 'excluir'

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
  filtros:         MetaFiltroRegra[]
  filtro_tipo:     MetaFiltro | null   // legado
  filtro_valores:  string[] | null     // legado
  filtro_modo:     MetaModo            // legado
  mix_numerador_categoria_id:   string | null
  mix_denominador_categoria_id: string | null
  mix_numerador:   string[] | null     // fallback quando não há categoria
  mix_denominador: string[] | null     // fallback quando não há categoria
  checklist_template_id: string | null // usado quando campo='checklist'
  valor_meta:      number
  period_start:    string
  period_end:      string
  criado_em:       string
  atualizado_em:   string
}

const CAMPOS_VALIDOS:  readonly MetaCampo[]  = ['faturamento','quantidade','margem','mix','markup','checklist']
const FILTROS_VALIDOS: readonly MetaFiltro[] = ['produto','grupo_produto','subgrupo_produto','produto_tipo']
const MODOS_VALIDOS:   readonly MetaModo[]   = ['incluir','excluir']

export function validarFiltros(input: unknown): { ok: true; value: MetaFiltroRegra[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'filtros deve ser um array' }
  const out: MetaFiltroRegra[] = []
  for (let i = 0; i < input.length; i++) {
    const f = input[i] as Partial<MetaFiltroRegra>
    if (!f.tipo || !FILTROS_VALIDOS.includes(f.tipo as MetaFiltro)) {
      return { ok: false, error: `filtros[${i}].tipo inválido — use ${FILTROS_VALIDOS.join(', ')}` }
    }
    if (!Array.isArray(f.valores)) {
      return { ok: false, error: `filtros[${i}].valores deve ser um array` }
    }
    if (f.modo && !MODOS_VALIDOS.includes(f.modo as MetaModo)) {
      return { ok: false, error: `filtros[${i}].modo inválido — use ${MODOS_VALIDOS.join(', ')}` }
    }
    out.push({
      tipo:    f.tipo as MetaFiltro,
      valores: f.valores.map(v => String(v)),
      modo:    (f.modo as MetaModo) ?? 'incluir',
    })
  }
  return { ok: true, value: out }
}

// ─── GET — lista metas (filtros opcionais por posto/grupo/período) ──────────
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const postoId       = searchParams.get('posto_id')
  const grupoId       = searchParams.get('grupo_id')
  const periodoIni    = searchParams.get('periodo_ini')
  const periodoFim    = searchParams.get('periodo_fim')

  const admin = createAdminClient()
  let q = admin
    .from('comissio_metas')
    .select('*')
    .order('period_start', { ascending: false })
    .order('nome')

  if (postoId)    q = q.eq('posto_id', postoId)
  if (grupoId)    q = q.eq('grupo_id', grupoId)
  if (periodoIni) q = q.gte('period_end',   periodoIni)
  if (periodoFim) q = q.lte('period_start', periodoFim)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ metas: (data ?? []) as Meta[] })
}

// ─── POST — cria meta ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Partial<{
    posto_id:        string
    grupo_id:        string | null
    nome:            string
    campo:           MetaCampo
    filtros:         unknown
    filtro_tipo:     MetaFiltro | null
    filtro_valores:  string[] | null
    filtro_modo:     MetaModo
    mix_numerador_categoria_id:   string | null
    mix_denominador_categoria_id: string | null
    mix_numerador:   string[] | null
    mix_denominador: string[] | null
    checklist_template_id: string | null
    valor_meta:      number
    period_start:    string
    period_end:      string
  }>

  if (!body.posto_id)      return NextResponse.json({ error: 'posto_id é obrigatório'      }, { status: 400 })
  if (!body.nome?.trim())  return NextResponse.json({ error: 'nome é obrigatório'          }, { status: 400 })
  if (!body.campo)         return NextResponse.json({ error: 'campo é obrigatório'         }, { status: 400 })
  if (!body.period_start)  return NextResponse.json({ error: 'period_start é obrigatório'  }, { status: 400 })
  if (!body.period_end)    return NextResponse.json({ error: 'period_end é obrigatório'    }, { status: 400 })

  if (!CAMPOS_VALIDOS.includes(body.campo)) {
    return NextResponse.json({ error: `campo inválido — use ${CAMPOS_VALIDOS.join(', ')}` }, { status: 400 })
  }
  if (body.filtro_tipo && !FILTROS_VALIDOS.includes(body.filtro_tipo)) {
    return NextResponse.json({ error: `filtro_tipo inválido — use ${FILTROS_VALIDOS.join(', ')}` }, { status: 400 })
  }
  if (body.filtro_modo && !MODOS_VALIDOS.includes(body.filtro_modo)) {
    return NextResponse.json({ error: `filtro_modo inválido — use ${MODOS_VALIDOS.join(', ')}` }, { status: 400 })
  }
  if (body.period_end < body.period_start) {
    return NextResponse.json({ error: 'period_end deve ser >= period_start' }, { status: 400 })
  }

  let filtros: MetaFiltroRegra[] = []
  if (body.filtros !== undefined) {
    const v = validarFiltros(body.filtros)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    filtros = v.value
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('comissio_metas')
    .insert({
      posto_id:        body.posto_id,
      grupo_id:        body.grupo_id ?? null,
      nome:            body.nome.trim(),
      campo:           body.campo,
      filtros,
      // Mantém campos legados sincronizados c/ o primeiro filtro (quando há
      // apenas 1) para compatibilidade com APIs/relatórios que ainda os
      // consultam diretamente. Com múltiplos filtros, viram null.
      filtro_tipo:     filtros.length === 1 ? filtros[0].tipo    : (body.filtro_tipo    ?? null),
      filtro_valores:  filtros.length === 1 ? filtros[0].valores : (body.filtro_valores ?? null),
      filtro_modo:     filtros.length === 1 ? filtros[0].modo    : (body.filtro_modo    ?? 'incluir'),
      // Mix — só populado quando campo='mix'. Demais campos forçam NULL pra
      // não poluir metas que não são de mix.
      mix_numerador_categoria_id:   body.campo === 'mix' ? (body.mix_numerador_categoria_id   ?? null) : null,
      mix_denominador_categoria_id: body.campo === 'mix' ? (body.mix_denominador_categoria_id ?? null) : null,
      mix_numerador:                body.campo === 'mix' ? (body.mix_numerador   ?? null) : null,
      mix_denominador:              body.campo === 'mix' ? (body.mix_denominador ?? null) : null,
      // Checklist — só populado quando campo='checklist'.
      checklist_template_id:        body.campo === 'checklist' ? (body.checklist_template_id ?? null) : null,
      valor_meta:      Number(body.valor_meta ?? 0),
      period_start:    body.period_start,
      period_end:      body.period_end,
      criado_por:      user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ meta: data })
}
