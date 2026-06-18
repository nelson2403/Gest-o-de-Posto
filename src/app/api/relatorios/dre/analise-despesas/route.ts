import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buscarContasPorGrid,
  buscarCodigosComDescendentes,
  buscarGruposProduto,
  aggregarMovtoPorContaPorMes,
  aggregarVendasCustosPorGrupoPorMes,
} from '@/lib/autosystem'
import type { DrillItem } from '../drill/route'

// ─── Tipos ────────────────────────────────────────────────────

// Uma sub-linha descendente da linha marcada (ex.: "Despesas com Pessoal"
// dentro de "DESPESAS GERAIS E ADMINISTRATIVAS"). Listada em DFS, com
// `depth` = nível na hierarquia (0 = filha direta da linha marcada).
export interface AnaliseDespesasSubGrupo {
  linha_id:      string
  linha_nome:    string
  depth:         number
  itens:         DrillItem[]   // contas/grupos mapeados nessa sub-linha
  total_por_mes: number[]      // só desta sub-linha (não inclui descendentes)
  total:         number
}

export interface AnaliseDespesasLinha {
  linha_id:        string
  linha_nome:      string
  // Sub-linhas descendentes da linha marcada, em DFS.
  sub_grupos:      AnaliseDespesasSubGrupo[]
  // Mapeamentos da própria linha marcada (raros: a linha marcada
  // geralmente é um "guarda-chuva" sem mapeamentos diretos).
  itens_diretos:   DrillItem[]
  // Agregado: sub_grupos + itens_diretos.
  total_por_mes:   number[]
  total:           number
}

export interface AnaliseDespesasResponse {
  meses:  string[]
  linhas: AnaliseDespesasLinha[]
}

// ─── Helpers (copiados do drill p/ manter o endpoint auto-contido) ───

function calcularJanela(meses: number, refAno: number, refMes: number) {
  const dataFim = new Date(refAno, refMes, 0)
  const dataIni = new Date(refAno, refMes - meses, 1)
  const mesesISO: string[] = []
  for (let i = 0; i < meses; i++) {
    const d = new Date(refAno, refMes - meses + i, 1)
    mesesISO.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { dataIni: fmt(dataIni), dataFim: fmt(dataFim), mesesISO }
}

function lerRef(sp: URLSearchParams): { refAno: number; refMes: number } {
  const ref = sp.get('ref')
  if (ref && /^\d{4}-\d{2}$/.test(ref)) {
    const [a, m] = ref.split('-').map(Number)
    if (m >= 1 && m <= 12) return { refAno: a, refMes: m }
  }
  const hoje = new Date()
  return { refAno: hoje.getFullYear(), refMes: hoje.getMonth() + 1 }
}

async function getEmpresaIds(
  admin: ReturnType<typeof createAdminClient>,
  empresaFiltro: number[] | null = null,
) {
  const { data: postos } = await admin
    .from('postos')
    .select('codigo_empresa_externo')
    .not('codigo_empresa_externo', 'is', null)
  const all = Array.from(new Set(
    (postos ?? []).map(p => Number(p.codigo_empresa_externo)).filter(n => !Number.isNaN(n))
  ))
  if (empresaFiltro && empresaFiltro.length > 0) {
    const allowed = new Set(empresaFiltro)
    const inter = all.filter(c => allowed.has(c))
    return inter.length > 0 ? inter : []
  }
  return all
}

// Lê `empresa` como CSV (ex.: "1,2,3"). Aceita também valor único.
function parseEmpresaCsv(raw: string | null): number[] | null {
  if (!raw) return null
  const arr = raw.split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s)).map(Number)
  return arr.length > 0 ? arr : null
}

// ─── GET ──────────────────────────────────────────────────────
//
// Retorna, para cada linha da máscara marcada com
// `usar_em_analise_despesas = TRUE`, as contas e grupos vinculados a ela
// com valores agregados por mês.
//
// Query params:
//   • mascara_id  (uuid)        — obrigatório
//   • periodo     (1|3|6)       — número de meses, default 3
//   • ref         (YYYY-MM)     — mês de referência (último incluído)
//   • empresa     (codigo AS)   — opcional, restringe ao filtro

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const mascaraId    = sp.get('mascara_id')
  const periodoMeses = Number(sp.get('periodo')) || 3
  if (!mascaraId) return NextResponse.json({ error: 'mascara_id é obrigatório' }, { status: 400 })
  if (![1, 3, 6].includes(periodoMeses)) {
    return NextResponse.json({ error: 'periodo deve ser 1, 3 ou 6' }, { status: 400 })
  }

  const { refAno, refMes } = lerRef(sp)
  const { dataIni, dataFim, mesesISO } = calcularJanela(periodoMeses, refAno, refMes)
  const admin = createAdminClient()

  const empresaFiltro  = parseEmpresaCsv(sp.get('empresa'))
  const empresaIds = await getEmpresaIds(admin, empresaFiltro)

  try {
    // 1. Busca TODAS as linhas da máscara (precisamos da hierarquia completa
    //    para descobrir os descendentes das linhas marcadas).
    const { data: todasLinhas, error: erLinhas } = await admin
      .from('mascaras_linhas')
      .select('id, nome, ordem, parent_id, tipo_linha, usar_em_analise_despesas')
      .eq('mascara_id', mascaraId)
      .order('ordem')
    if (erLinhas) return NextResponse.json({ error: erLinhas.message }, { status: 500 })

    type LinhaDB = {
      id: string; nome: string; ordem: number; parent_id: string | null
      tipo_linha: 'grupo' | 'subtotal'
      usar_em_analise_despesas: boolean
    }
    const linhasAll = (todasLinhas ?? []) as LinhaDB[]

    // Linhas marcadas como Análise de Despesas (raiz dos cards)
    const marcadas = linhasAll.filter(l => l.usar_em_analise_despesas && l.tipo_linha === 'grupo')
    if (marcadas.length === 0) {
      const resp: AnaliseDespesasResponse = { meses: mesesISO, linhas: [] }
      return NextResponse.json(resp)
    }

    // Index: parent_id → filhos diretos (já ordenados por `ordem` pelo SELECT acima)
    const filhosPorPai = new Map<string | null, LinhaDB[]>()
    for (const l of linhasAll) {
      const arr = filhosPorPai.get(l.parent_id) ?? []
      arr.push(l)
      filhosPorPai.set(l.parent_id, arr)
    }

    // DFS dos descendentes de uma linha (não inclui a própria linha; só
    // sub-linhas tipo_linha='grupo' — subtotais são ignorados aqui porque
    // não têm mapeamentos próprios).
    function descendentes(linhaId: string, depth = 0): { linha: LinhaDB; depth: number }[] {
      const out: { linha: LinhaDB; depth: number }[] = []
      for (const filho of filhosPorPai.get(linhaId) ?? []) {
        if (filho.tipo_linha === 'grupo') out.push({ linha: filho, depth })
        out.push(...descendentes(filho.id, depth + 1))
      }
      return out
    }

    // Para cada linha marcada, descobre seus descendentes-grupo (DFS).
    // Mantém também os ids das linhas marcadas (algumas podem ter
    // mapeamentos próprios mesmo sendo "guarda-chuva").
    const descendentesPorMarcada = new Map<string, { linha: LinhaDB; depth: number }[]>()
    const todosIdsRelevantes = new Set<string>()
    for (const m of marcadas) {
      const desc = descendentes(m.id, 0)
      descendentesPorMarcada.set(m.id, desc)
      todosIdsRelevantes.add(m.id)
      for (const d of desc) todosIdsRelevantes.add(d.linha.id)
    }

    const linhaIds = Array.from(todosIdsRelevantes)

    // 2. Mapeamentos (contas + grupos de produto) das linhas relevantes
    const [mcResp, mgResp] = await Promise.all([
      admin.from('mascaras_mapeamentos')
        .select('linha_id, conta_grid')
        .eq('mascara_id', mascaraId)
        .in('linha_id', linhaIds),
      admin.from('mascaras_mapeamentos_grupos')
        .select('linha_id, grupo_grid, tipo_valor')
        .eq('mascara_id', mascaraId)
        .in('linha_id', linhaIds),
    ])
    if (mcResp.error) return NextResponse.json({ error: mcResp.error.message }, { status: 500 })
    if (mgResp.error) return NextResponse.json({ error: mgResp.error.message }, { status: 500 })

    // Mapeia linha → [conta_grid] e linha → [{grupo_grid, tipo_valor}]
    const contasPorLinha = new Map<string, string[]>()
    const todasContasGrids = new Set<string>()
    for (const r of mcResp.data ?? []) {
      const lid = r.linha_id as string
      const cg = String(r.conta_grid)
      const arr = contasPorLinha.get(lid) ?? []
      arr.push(cg)
      contasPorLinha.set(lid, arr)
      todasContasGrids.add(cg)
    }

    interface GrupoMap { grupo_grid: string; tipo_valor: 'venda' | 'custo' }
    const gruposPorLinha = new Map<string, GrupoMap[]>()
    const todosGrupoGrids = new Set<string>()
    for (const r of mgResp.data ?? []) {
      const lid = r.linha_id as string
      const gm: GrupoMap = {
        grupo_grid: String(r.grupo_grid),
        tipo_valor: r.tipo_valor as 'venda' | 'custo',
      }
      const arr = gruposPorLinha.get(lid) ?? []
      arr.push(gm)
      gruposPorLinha.set(lid, arr)
      todosGrupoGrids.add(gm.grupo_grid)
    }

    // 3. Resolve contas/grupos e agrega valores em UMA passada por dimensão
    //    (otimização: faz no máximo uma query por dimensão, mesmo com N linhas)
    const balPorContaCodigoMes = new Map<string, Map<string, number>>()
    const contasDetalhe = new Map<string, { grid: string; codigo: string; nome: string; natureza: 'Débito' | 'Crédito' }>()
    if (todasContasGrids.size > 0) {
      const detalhes = await buscarContasPorGrid(Array.from(todasContasGrids))
      for (const d of detalhes) {
        contasDetalhe.set(String(d.grid), {
          grid: String(d.grid),
          codigo: d.codigo,
          nome: d.nome,
          natureza: d.natureza,
        })
      }
      const codigosBase = detalhes.map(d => d.codigo)
      const expandidos = codigosBase.length
        ? await buscarCodigosComDescendentes(codigosBase)
        : []
      const codigoToParent = new Map(expandidos.map(e => [e.codigo, e.parent]))
      const todosCodigos = expandidos.map(e => e.codigo)
      const movtos = empresaIds.length && todosCodigos.length
        ? await aggregarMovtoPorContaPorMes(empresaIds, dataIni, dataFim, todosCodigos)
        : []
      for (const m of movtos) {
        const parent = codigoToParent.get(m.codigo) ?? m.codigo
        if (!balPorContaCodigoMes.has(parent)) balPorContaCodigoMes.set(parent, new Map())
        const bal = Number(m.total_creditar) - Number(m.total_debitar)
        const cur = balPorContaCodigoMes.get(parent)!.get(m.mes) ?? 0
        balPorContaCodigoMes.get(parent)!.set(m.mes, cur + bal)
      }
    }

    const vcByGrid = new Map<string, Map<string, { total_venda: number; total_custo: number }>>()
    const grupoInfoById = new Map<string, { id: string | number; codigo: number; nome: string }>()
    if (todosGrupoGrids.size > 0) {
      const todosGruposProduto = await buscarGruposProduto()
      for (const g of todosGruposProduto) grupoInfoById.set(String(g.id), g)
      const grupoGridsArr = Array.from(todosGrupoGrids)
      const vc = empresaIds.length
        ? await aggregarVendasCustosPorGrupoPorMes(empresaIds, dataIni, dataFim, grupoGridsArr)
        : []
      for (const v of vc) {
        if (!vcByGrid.has(String(v.grupo_grid))) vcByGrid.set(String(v.grupo_grid), new Map())
        vcByGrid.get(String(v.grupo_grid))!.set(v.mes, {
          total_venda: Number(v.total_venda),
          total_custo: Number(v.total_custo),
        })
      }
    }

    // 4. Helper: materializa itens (contas + grupos de produto) de uma linha
    function itensDeLinha(linhaId: string): DrillItem[] {
      const out: DrillItem[] = []
      for (const cg of contasPorLinha.get(linhaId) ?? []) {
        const d = contasDetalhe.get(cg)
        if (!d) continue
        const valoresPorMes = mesesISO.map(mes => balPorContaCodigoMes.get(d.codigo)?.get(mes) ?? 0)
        out.push({
          tipo: 'conta',
          conta_grid: d.grid,
          codigo: d.codigo,
          nome: d.nome,
          natureza: d.natureza,
          valoresPorMes,
          total: valoresPorMes.reduce((s, v) => s + v, 0),
        })
      }
      for (const gm of gruposPorLinha.get(linhaId) ?? []) {
        const info = grupoInfoById.get(gm.grupo_grid)
        const valoresPorMes = mesesISO.map(mes => {
          const data = vcByGrid.get(gm.grupo_grid)?.get(mes)
          if (!data) return 0
          return gm.tipo_valor === 'venda' ? data.total_venda : data.total_custo
        })
        out.push({
          tipo: 'grupo',
          grupo_grid: gm.grupo_grid,
          codigo: info?.codigo ?? 0,
          nome:   info?.nome ?? gm.grupo_grid,
          tipo_valor: gm.tipo_valor,
          valoresPorMes,
          total: valoresPorMes.reduce((s, v) => s + v, 0),
        })
      }
      return out
    }

    // 5. Monta a resposta — cada linha marcada vira um card com seus
    //    sub-grupos (DFS) + itens diretos eventualmente mapeados na própria.
    const linhasOut: AnaliseDespesasLinha[] = marcadas.map(marcada => {
      const subDescs = descendentesPorMarcada.get(marcada.id) ?? []
      const sub_grupos: AnaliseDespesasSubGrupo[] = subDescs.map(({ linha, depth }) => {
        const itens = itensDeLinha(linha.id)
        const total_por_mes = mesesISO.map((_, idx) =>
          itens.reduce((s, it) => s + (it.valoresPorMes[idx] ?? 0), 0)
        )
        return {
          linha_id:   linha.id,
          linha_nome: linha.nome,
          depth,
          itens,
          total_por_mes,
          total: total_por_mes.reduce((s, v) => s + v, 0),
        }
      })

      const itens_diretos = itensDeLinha(marcada.id)
      const total_por_mes = mesesISO.map((_, idx) =>
          itens_diretos.reduce((s, it) => s + (it.valoresPorMes[idx] ?? 0), 0)
        + sub_grupos.reduce((s, sg) => s + (sg.total_por_mes[idx] ?? 0), 0)
      )
      const total = total_por_mes.reduce((s, v) => s + v, 0)

      return {
        linha_id:    marcada.id,
        linha_nome:  marcada.nome,
        sub_grupos,
        itens_diretos,
        total_por_mes,
        total,
      }
    })

    const resp: AnaliseDespesasResponse = { meses: mesesISO, linhas: linhasOut }
    return NextResponse.json(resp)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao consultar AUTOSYSTEM'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
