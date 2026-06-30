import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  carregarRegrasDoEsquema, carregarMetasDoPosto, carregarMembrosDoPosto,
  carregarVendas, resolverEmpresaExterna, carregarEsquema,
} from '@/lib/comissionamento/data-loader'
import { calcularAtingimento } from '@/lib/comissionamento/goals-aggregation'
import { vendaPassaProductFilters } from '@/lib/comissionamento/rule-engine'
import type { Regra, Venda } from '@/lib/comissionamento/types'

export const dynamic = 'force-dynamic'

// GET /api/comissionamento/diagnostico-vendedor
//   ?posto_id=<uuid>
//   &esquema_id=<uuid>
//   &data_ini=YYYY-MM-DD
//   &data_fim=YYYY-MM-DD
//   &vendedor_id=<pessoa.grid no AUTOSYSTEM>
//
// Não rebatemos o engine de novo — só carregamos o estado e mostramos o que
// ele consegue resolver para esse vendedor: cargo no ctx, atingimento de
// cada meta, e para cada regra se ela casaria ou não (com o motivo).
// Útil para entender por que um gerente está saindo com R$ 0,00.

interface TraceCondicao {
  field:        string
  operator:     string
  value:        unknown
  resultado:    boolean
  valor_ctx:    unknown
  motivo?:      string
}
interface TraceRegra {
  regra_id:     string
  nome:         string
  ativa:        boolean
  meta_referencia_id: string | null
  meta_referencia_nome: string | null
  realizado_escopo: string
  base_escopo:  string
  atingimento_resolvido: number | null
  condicoes_avaliadas: TraceCondicao[]
  casaria:      boolean
  motivo_geral: string
}

function descreveCondicao(c: { field?: string; operator?: string; value?: unknown }): {
  field: string; operator: string; value: unknown
} {
  return {
    field:    String(c.field ?? '?'),
    operator: String(c.operator ?? '?'),
    value:    c.value ?? null,
  }
}

function avaliaCondicaoTrace(
  c: { field?: string; operator?: string; value?: unknown; value2?: unknown },
  ctx: Record<string, unknown>,
): TraceCondicao {
  const desc = descreveCondicao(c)
  if (!c.field || !c.operator || c.value === null || c.value === undefined) {
    return { ...desc, resultado: true, valor_ctx: null, motivo: 'condição incompleta — ignorada' }
  }

  // Atingimento de meta: precisa de valor numérico no ctx
  if (c.field === 'atingimento_meta') {
    const at = ctx.atingimento_meta as number | null
    if (at === null || at === undefined) {
      return { ...desc, resultado: false, valor_ctx: null, motivo: 'atingimento_meta no ctx é null — meta de referência não resolve' }
    }
    const v = Number(c.value)
    const ok = compNum(at, String(c.operator), v)
    return { ...desc, resultado: ok, valor_ctx: at, motivo: ok ? '' : `${at} ${c.operator} ${v} = false` }
  }

  const raw = ctx[c.field]
  if (raw === null || raw === undefined) {
    return { ...desc, resultado: false, valor_ctx: null, motivo: `campo "${c.field}" sem valor no ctx` }
  }

  if (typeof raw === 'number') {
    const ok = compNum(raw, String(c.operator), Number(c.value))
    return { ...desc, resultado: ok, valor_ctx: raw, motivo: ok ? '' : `${raw} ${c.operator} ${c.value} = false` }
  }
  const a = String(raw).toLowerCase()
  const b = String(c.value).toLowerCase()
  const ok = compStr(a, String(c.operator), b)
  return { ...desc, resultado: ok, valor_ctx: raw, motivo: ok ? '' : `"${raw}" ${c.operator} "${c.value}" = false` }
}
function compNum(a: number, op: string, b: number): boolean {
  switch (op) {
    case 'eq': return a === b
    case 'neq': return a !== b
    case 'gt': return a > b
    case 'gte': return a >= b
    case 'lt': return a < b
    case 'lte': return a <= b
    default: return false
  }
}
function compStr(a: string, op: string, b: string): boolean {
  switch (op) {
    case 'eq': return a === b
    case 'neq': return a !== b
    case 'contains': return a.includes(b)
    case 'not_contains': return !a.includes(b)
    case 'starts_with': return a.startsWith(b)
    default: return false
  }
}

function condicoesPlanas(regra: Regra): Array<{ field?: string; operator?: string; value?: unknown; value2?: unknown }> {
  const out: Array<{ field?: string; operator?: string; value?: unknown; value2?: unknown }> = []
  function walk(g: { conditions?: unknown[]; groups?: unknown[] } | null | undefined) {
    if (!g) return
    if (Array.isArray(g.conditions)) {
      for (const c of g.conditions) out.push(c as { field?: string; operator?: string; value?: unknown })
    }
    if (Array.isArray(g.groups)) {
      for (const sg of g.groups) walk(sg as { conditions?: unknown[]; groups?: unknown[] })
    }
  }
  walk(regra.condicoes as unknown as { conditions?: unknown[]; groups?: unknown[] })
  return out
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const postoId    = sp.get('posto_id')    ?? ''
  const esquemaId  = sp.get('esquema_id')  ?? ''
  const dataIni    = sp.get('data_ini')    ?? ''
  const dataFim    = sp.get('data_fim')    ?? ''
  const vendedorId = sp.get('vendedor_id') ?? ''

  if (!postoId || !esquemaId || !dataIni || !dataFim || !vendedorId) {
    return NextResponse.json({ error: 'posto_id, esquema_id, data_ini, data_fim e vendedor_id são obrigatórios' }, { status: 400 })
  }

  const empresaExterna = await resolverEmpresaExterna(postoId)
  if (empresaExterna == null) {
    return NextResponse.json({ error: 'Posto sem codigo_empresa_externo' }, { status: 400 })
  }

  const [esquema, regras, metasESplits, membros, vendas] = await Promise.all([
    carregarEsquema(esquemaId),
    carregarRegrasDoEsquema(esquemaId),
    carregarMetasDoPosto(postoId, dataIni, dataFim),
    carregarMembrosDoPosto(postoId),
    carregarVendas([empresaExterna], dataIni, dataFim),
  ])
  const { metas, splits } = metasESplits

  const productFilters = esquema?.product_filters ?? []
  const vendasNoEscopo = vendas.filter((v: Venda) => vendaPassaProductFilters(v, productFilters))

  const { atingimentoPorVendedorPorMeta, atingimentoTotalPorMeta } =
    calcularAtingimento({ vendas, metas, splits, membros })

  // ── Resolve o membro do vendedor pelo external_person_id ────────────────
  const membro = membros.find(m => m.external_person_id === vendedorId)
  const vendasDoVendedor = vendasNoEscopo.filter(v => String(v.vendedor_id ?? '') === vendedorId)
  const cargoCtx = membro?.role ?? (vendasDoVendedor[0]?.cargo ?? '')

  const metaPorId = new Map(metas.map(m => [m.id, m]))
  const traceRegras: TraceRegra[] = []

  for (const r of regras) {
    const ativa = r.status === 'ativo'
    let metaRefNome: string | null = null
    let atingimento: number | null = null

    if (r.meta_referencia_id) {
      const meta = metaPorId.get(r.meta_referencia_id)
      metaRefNome = meta?.nome ?? null
      if (meta) {
        if (r.realizado_escopo === 'todos') {
          atingimento = atingimentoTotalPorMeta.get(meta.id) ?? null
        } else {
          atingimento = atingimentoPorVendedorPorMeta.get(vendedorId)?.get(meta.id) ?? null
        }
      }
    }

    const fat = vendasDoVendedor.reduce((s, v) => s + v.valor_total, 0)
    const qtd = vendasDoVendedor.reduce((s, v) => s + v.quantidade, 0)
    const lucro = vendasDoVendedor.reduce((s, v) => s + (v.valor_total - v.custo_medio_unitario * v.quantidade), 0)
    const ctx: Record<string, unknown> = {
      produto:          '',
      grupo_produto:    '',
      subgrupo_produto: '',
      vendedor:         vendasDoVendedor[0]?.vendedor_nome ?? membro?.nome ?? '',
      cargo:            cargoCtx,
      posto:            String(vendasDoVendedor[0]?.empresa_id ?? ''),
      faturamento:      fat,
      quantidade:       qtd,
      mix:              new Set(vendasDoVendedor.map(v => v.produto_nome)).size,
      margem:           fat > 0 ? (lucro / fat) * 100 : 0,
      atingimento_meta: atingimento,
    }

    const conds = condicoesPlanas(r)
    const condTrace = conds.map(c => avaliaCondicaoTrace(c, ctx))
    const todasOK = condTrace.every(c => c.resultado)
    const casaria = ativa && todasOK
    let motivoGeral = ''
    if (!ativa) motivoGeral = `Regra está com status="${r.status}" — só status="ativo" entra no engine`
    else if (!todasOK) motivoGeral = 'Pelo menos uma condição falhou (ver detalhe)'
    else motivoGeral = 'Casaria — regra deveria aplicar'

    traceRegras.push({
      regra_id: r.id, nome: r.nome, ativa,
      meta_referencia_id: r.meta_referencia_id,
      meta_referencia_nome: metaRefNome,
      realizado_escopo: r.realizado_escopo,
      base_escopo: r.base_escopo,
      atingimento_resolvido: atingimento,
      condicoes_avaliadas: condTrace,
      casaria,
      motivo_geral: motivoGeral,
    })
  }

  return NextResponse.json({
    vendedor: {
      external_id: vendedorId,
      nome_membro: membro?.nome ?? null,
      role_membro: membro?.role ?? null,
      tem_membro:  !!membro,
      qtd_vendas:  vendasDoVendedor.length,
    },
    contexto: {
      cargo_no_ctx: cargoCtx,
    },
    metas_no_periodo: metas.map(m => ({
      id: m.id, nome: m.nome, campo: m.campo,
      valor_meta: m.valor_meta,
      atingimento_total:    atingimentoTotalPorMeta.get(m.id) ?? null,
      atingimento_vendedor: atingimentoPorVendedorPorMeta.get(vendedorId)?.get(m.id) ?? null,
    })),
    regras: traceRegras,
  })
}
