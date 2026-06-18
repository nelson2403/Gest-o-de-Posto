// ─────────────────────────────────────────────────────────────────────────────
// Data loader: busca regras / metas / membros / vendas necessários para o
// motor de comissionamento.
//
// Conectores: Supabase (regras, metas, splits, membros, postos) +
// AUTOSYSTEM (vendas via `buscarVendasParaComissionamento`).
//
// Roda apenas no servidor (usa createAdminClient).
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase/admin'
import { buscarVendasParaComissionamento } from '@/lib/autosystem'
import { parseCondicoes } from '@/app/(dashboard)/comissionamento/_lib/conditions'
import type {
  Regra, Meta, MetaSplit, Membro, Venda, RegraStatus,
  Esquema, ProductFilter, EsquemaStatus, EscopoRegraTipo, RegraCampo, RegraEscopo,
} from './types'

// ── Esquema (com product_filters) ───────────────────────────────────────────
export async function carregarEsquema(esquemaId: string): Promise<Esquema | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('comissio_esquemas')
    .select('id, nome, status, product_filters')
    .eq('id', esquemaId)
    .single()
  if (error || !data) return null
  return {
    id:              data.id as string,
    nome:            data.nome as string,
    status:          data.status as EsquemaStatus,
    product_filters: (Array.isArray(data.product_filters) ? data.product_filters : []) as ProductFilter[],
  }
}

// ── Regras de um esquema ────────────────────────────────────────────────────
export async function carregarRegrasDoEsquema(esquemaId: string): Promise<Regra[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('comissio_regras')
    .select('*')
    .eq('esquema_id', esquemaId)
    .order('prioridade')

  if (error) throw new Error(`Erro ao buscar regras: ${error.message}`)

  return (data ?? []).map((r: any) => ({
    id:                   r.id,
    esquema_id:           r.esquema_id,
    nome:                 r.nome,
    status:               r.status as RegraStatus,
    prioridade:           Number(r.prioridade),
    condicoes:            parseCondicoes(r.condicoes),
    resultado_modo:       r.resultado_modo,
    resultado_tipo:       r.resultado_tipo,
    resultado_valor:      Number(r.resultado_valor),
    resultado_base_valor: Number(r.resultado_base_valor ?? 0),
    escopo_tipo:          (r.escopo_tipo ?? null) as EscopoRegraTipo | null,
    escopo_valor:         String(r.escopo_valor ?? ''),
    meta_referencia_id:   (r.meta_referencia_id ?? null) as string | null,
    // Filtros JSONB — defensivos: confiamos no CHECK do banco para os enums
    // de campo; para os filtros validamos apenas que veio um array.
    realizado_filtros:    Array.isArray(r.realizado_filtros) ? (r.realizado_filtros as ProductFilter[]) : [],
    realizado_campo:      (r.realizado_campo ?? 'faturamento') as RegraCampo,
    base_filtros:         Array.isArray(r.base_filtros) ? (r.base_filtros as ProductFilter[]) : [],
    base_campo:           (r.base_campo ?? 'faturamento') as RegraCampo,
    realizado_escopo:     (r.realizado_escopo ?? 'vendedor') as RegraEscopo,
    base_escopo:          (r.base_escopo ?? 'vendedor') as RegraEscopo,
  }))
}

// ── Metas + splits de um posto, vigentes no intervalo ────────────────────────
export async function carregarMetasDoPosto(
  postoId: string,
  dataIni: string,
  dataFim: string,
): Promise<{ metas: Meta[]; splits: MetaSplit[] }> {
  const admin = createAdminClient()

  // Metas cuja janela cruza o intervalo do cálculo
  const { data: metasData, error: er1 } = await admin
    .from('comissio_metas')
    .select('*')
    .eq('posto_id', postoId)
    .gte('period_end',   dataIni)
    .lte('period_start', dataFim)

  if (er1) throw new Error(`Erro ao buscar metas: ${er1.message}`)

  // Resolve categorias de mix (lookup uma vez para todas as metas)
  const categoriaIds = new Set<string>()
  for (const m of metasData ?? []) {
    if (m.mix_numerador_categoria_id)   categoriaIds.add(m.mix_numerador_categoria_id as string)
    if (m.mix_denominador_categoria_id) categoriaIds.add(m.mix_denominador_categoria_id as string)
  }
  const produtosPorCategoria = new Map<string, string[]>()
  if (categoriaIds.size > 0) {
    const { data: links, error: erLinks } = await admin
      .from('comissio_categoria_produtos')
      .select('categoria_id, produto_nome')
      .in('categoria_id', Array.from(categoriaIds))
    if (erLinks) throw new Error(`Erro ao buscar produtos de categorias: ${erLinks.message}`)
    for (const l of links ?? []) {
      const cid = l.categoria_id as string
      const nome = String(l.produto_nome ?? '')
      if (!nome) continue
      const arr = produtosPorCategoria.get(cid) ?? []
      arr.push(nome)
      produtosPorCategoria.set(cid, arr)
    }
  }

  const metas: Meta[] = (metasData ?? []).map((m: any) => {
    // `filtros` é JSONB no banco (default '[]'). Quando vazio mas os campos
    // legados estão preenchidos (metas criadas antes da migration 084),
    // sintetiza um filtro equivalente — assim o engine vê o mesmo
    // comportamento sem precisar tratar dois formatos.
    const rawFiltros: unknown = m.filtros
    let filtros: Meta['filtros'] = []
    if (Array.isArray(rawFiltros)) {
      filtros = (rawFiltros as any[])
        .filter(f => f && f.tipo && Array.isArray(f.valores))
        .map(f => ({
          tipo:    f.tipo,
          valores: (f.valores as unknown[]).map(v => String(v)),
          modo:    f.modo === 'excluir' ? 'excluir' : 'incluir',
        }))
    }
    if (filtros.length === 0 && m.filtro_tipo && Array.isArray(m.filtro_valores) && m.filtro_valores.length > 0) {
      filtros = [{
        tipo:    m.filtro_tipo,
        valores: m.filtro_valores,
        modo:    m.filtro_modo === 'excluir' ? 'excluir' : 'incluir',
      }]
    }

    // Mix: prefere lista vinda de categoria; cai pra mix_* (legado) só
    // quando a categoria não está setada.
    const numCatId = (m.mix_numerador_categoria_id   as string | null) ?? null
    const denCatId = (m.mix_denominador_categoria_id as string | null) ?? null
    const mixNumerador: string[] | null = numCatId
      ? (produtosPorCategoria.get(numCatId) ?? [])
      : (Array.isArray(m.mix_numerador) ? (m.mix_numerador as unknown[]).map(v => String(v)) : null)
    const mixDenominador: string[] | null = denCatId
      ? (produtosPorCategoria.get(denCatId) ?? [])
      : (Array.isArray(m.mix_denominador) ? (m.mix_denominador as unknown[]).map(v => String(v)) : null)

    return {
      id:              m.id,
      posto_id:        m.posto_id,
      grupo_id:        m.grupo_id,
      nome:            m.nome,
      campo:           m.campo,
      filtros,
      filtro_tipo:     m.filtro_tipo,
      filtro_valores:  m.filtro_valores,
      filtro_modo:     m.filtro_modo ?? 'incluir',
      mix_numerador_categoria_id:   numCatId,
      mix_denominador_categoria_id: denCatId,
      mix_numerador:   mixNumerador,
      mix_denominador: mixDenominador,
      valor_meta:      Number(m.valor_meta),
      period_start:    m.period_start,
      period_end:      m.period_end,
    }
  })

  if (metas.length === 0) return { metas: [], splits: [] }

  const { data: splitsData, error: er2 } = await admin
    .from('comissio_metas_splits')
    .select('meta_id, membro_id, valor_meta')
    .in('meta_id', metas.map(m => m.id))

  if (er2) throw new Error(`Erro ao buscar splits: ${er2.message}`)
  const splits: MetaSplit[] = (splitsData ?? []).map((s: any) => ({
    meta_id:    s.meta_id,
    membro_id:  s.membro_id,
    valor_meta: Number(s.valor_meta),
  }))

  return { metas, splits }
}

// ── Membros de um posto ─────────────────────────────────────────────────────
export async function carregarMembrosDoPosto(postoId: string): Promise<Membro[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('comissio_membros')
    .select('id, posto_id, external_person_id, nome, role, ativo')
    .eq('posto_id', postoId)

  if (error) throw new Error(`Erro ao buscar membros: ${error.message}`)

  return (data ?? []).map((m: any) => ({
    id:                  m.id,
    posto_id:            m.posto_id,
    external_person_id:  m.external_person_id,
    nome:                m.nome,
    role:                m.role,
    ativo:               !!m.ativo,
  }))
}

// ── Resolve posto_id → codigo_empresa_externo (AUTOSYSTEM) ──────────────────
export async function resolverEmpresaExterna(postoId: string): Promise<number | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('postos')
    .select('codigo_empresa_externo')
    .eq('id', postoId)
    .single()
  if (error || !data) return null
  const codigo = data.codigo_empresa_externo
  if (codigo == null) return null
  const n = Number(codigo)
  return isNaN(n) ? null : n
}

// ── Vendas do AUTOSYSTEM no intervalo ───────────────────────────────────────
export async function carregarVendas(
  empresaIds: number[],
  dataIni:    string,
  dataFim:    string,
): Promise<Venda[]> {
  if (!empresaIds.length) return []
  const rows = await buscarVendasParaComissionamento(empresaIds, dataIni, dataFim)
  return rows.map(r => ({
    grid:                 r.grid,
    empresa_id:           r.empresa_id,
    data:                 r.data,
    vendedor_id:          r.vendedor_id,
    vendedor_nome:        r.vendedor_nome,
    cargo:                r.cargo,
    produto:              r.produto,
    produto_nome:         r.produto_nome,
    produto_tipo:         r.produto_tipo,
    grupo_produto:        r.grupo_produto,
    subgrupo_produto:     r.subgrupo_produto,
    quantidade:           r.quantidade,
    valor_total:          r.valor_total,
    custo_medio_unitario: r.custo_medio_unitario,
  }))
}
