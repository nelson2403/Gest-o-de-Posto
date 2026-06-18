import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buscarContasPorGrid,
  buscarCodigosComDescendentes,
  buscarGruposProduto,
  buscarEmpresasComNomeReduzido,
  aggregarMovtoPorContaPorMes,
  aggregarVendasCustosPorGrupoPorMes,
} from '@/lib/autosystem'

// ─── Tipos ────────────────────────────────────────────────────

export interface GraficoMesItem  { mes: string; total: number }
export interface GraficoEmpresa  { empresa_id: number; empresa_nome: string; total: number }
export interface GraficoSubgrupo {
  linha_id:   string
  linha_nome: string
  total:      number
  por_empresa: GraficoEmpresa[]
}

export interface AnaliseDespesasGraficosResponse {
  // 12 meses calendário terminando no mês de referência
  ultimos_12_meses: GraficoMesItem[]
  // Para cada sub-grupo descendente das linhas marcadas, breakdown por empresa
  // (ignora o filtro `empresa` na query para permitir comparação entre todas).
  por_empresa: GraficoSubgrupo[]
}

// ─── Helpers ──────────────────────────────────────────────────

function calcularJanela12(refAno: number, refMes: number) {
  // Inclui mês de referência e os 11 anteriores
  const dataFim = new Date(refAno, refMes, 0)
  const dataIni = new Date(refAno, refMes - 12, 1)
  const mesesISO: string[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(refAno, refMes - 12 + i, 1)
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

async function getEmpresaIds(admin: ReturnType<typeof createAdminClient>) {
  const { data: postos } = await admin
    .from('postos')
    .select('codigo_empresa_externo')
    .not('codigo_empresa_externo', 'is', null)
  return Array.from(new Set(
    (postos ?? []).map(p => Number(p.codigo_empresa_externo)).filter(n => !Number.isNaN(n))
  ))
}

// Lê `empresa` como CSV. Vazio = sem filtro.
function parseEmpresaCsv(raw: string | null): number[] | null {
  if (!raw) return null
  const arr = raw.split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s)).map(Number)
  return arr.length > 0 ? arr : null
}

// ─── GET ──────────────────────────────────────────────────────
//
// Query params:
//   • mascara_id  (uuid)         — obrigatório
//   • ref         (YYYY-MM)      — mês de referência (último incluído)
//
// O endpoint sempre usa janela de 12 meses calendário, independente do
// `periodo` mostrado nos cards de tabela, porque "últimos 12 meses" é um
// gráfico padrão. O breakdown por empresa também sai dessa janela.

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const mascaraId = sp.get('mascara_id')
  if (!mascaraId) return NextResponse.json({ error: 'mascara_id é obrigatório' }, { status: 400 })

  const { refAno, refMes } = lerRef(sp)
  const { dataIni, dataFim, mesesISO } = calcularJanela12(refAno, refMes)
  const admin = createAdminClient()

  // Filtro de empresas — afeta o gráfico "ultimos_12_meses".
  // O gráfico "por_empresa" sempre usa TODAS as empresas (precisa do
  // breakdown completo para comparação; o front esconde o gráfico quando
  // há apenas 1 empresa selecionada).
  const todasEmpresas = await getEmpresaIds(admin)
  if (todasEmpresas.length === 0) {
    return NextResponse.json({ ultimos_12_meses: [], por_empresa: [] })
  }
  const empresaFiltro = parseEmpresaCsv(sp.get('empresa'))
  const empresaIdsParaMeses = empresaFiltro && empresaFiltro.length > 0
    ? todasEmpresas.filter(c => empresaFiltro.includes(c))
    : todasEmpresas
  const empresaIds = todasEmpresas  // alias usado nas pré-agregações por empresa

  try {
    // 1. Linhas da máscara (todas) — precisamos da hierarquia para DFS
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
    const linhas = (todasLinhas ?? []) as LinhaDB[]
    const marcadas = linhas.filter(l => l.usar_em_analise_despesas && l.tipo_linha === 'grupo')
    if (marcadas.length === 0) {
      return NextResponse.json({ ultimos_12_meses: [], por_empresa: [] })
    }

    // DFS por marcada → descendentes (linha-filhas tipo 'grupo')
    const filhosPorPai = new Map<string | null, LinhaDB[]>()
    for (const l of linhas) {
      const arr = filhosPorPai.get(l.parent_id) ?? []
      arr.push(l)
      filhosPorPai.set(l.parent_id, arr)
    }
    function descendentes(linhaId: string): LinhaDB[] {
      const out: LinhaDB[] = []
      for (const f of filhosPorPai.get(linhaId) ?? []) {
        if (f.tipo_linha === 'grupo') out.push(f)
        out.push(...descendentes(f.id))
      }
      return out
    }

    // 2. Mapeamentos das linhas relevantes (marcadas + descendentes)
    const todosIds = new Set<string>()
    const descsPorMarcada = new Map<string, LinhaDB[]>()
    for (const m of marcadas) {
      const desc = descendentes(m.id)
      descsPorMarcada.set(m.id, desc)
      todosIds.add(m.id)
      for (const d of desc) todosIds.add(d.id)
    }
    const linhaIds = Array.from(todosIds)

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

    // Mapas: linha_id → contas[], linha_id → grupos[]
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

    // 3. Resolve contas → códigos + expansão (uma vez só)
    const contasDetalhe = new Map<string, { codigo: string }>()
    if (todasContasGrids.size > 0) {
      const detalhes = await buscarContasPorGrid(Array.from(todasContasGrids))
      for (const d of detalhes) contasDetalhe.set(String(d.grid), { codigo: d.codigo })
    }
    const codigosBase = Array.from(contasDetalhe.values()).map(c => c.codigo)
    const expandidos = codigosBase.length
      ? await buscarCodigosComDescendentes(codigosBase)
      : []
    const codigoToParent = new Map(expandidos.map(e => [e.codigo, e.parent]))
    const todosCodigosExp = expandidos.map(e => e.codigo)

    // ── 4. Ultimos 12 meses (sobre todas as empresas) ──────────
    // Uma única chamada com todas as empresas; agregamos por mês depois.
    // Para o gráfico de 12 meses, respeitamos o filtro de empresas selecionado.
    const movtos = (todosCodigosExp.length && empresaIdsParaMeses.length)
      ? await aggregarMovtoPorContaPorMes(empresaIdsParaMeses, dataIni, dataFim, todosCodigosExp)
      : []
    // balance por (codigo_pai, mes); somatório no nível das contas mapeadas
    const balPorPaiMes = new Map<string, Map<string, number>>()
    for (const m of movtos) {
      const parent = codigoToParent.get(m.codigo) ?? m.codigo
      if (!balPorPaiMes.has(parent)) balPorPaiMes.set(parent, new Map())
      const bal = Number(m.total_creditar) - Number(m.total_debitar)
      const cur = balPorPaiMes.get(parent)!.get(m.mes) ?? 0
      balPorPaiMes.get(parent)!.set(m.mes, cur + bal)
    }
    // Soma grupos de produto
    let vcByGridMes: Map<string, Map<string, { total_venda: number; total_custo: number }>> = new Map()
    if (todosGrupoGrids.size > 0) {
      const vc = await aggregarVendasCustosPorGrupoPorMes(
        empresaIdsParaMeses, dataIni, dataFim, Array.from(todosGrupoGrids),
      )
      vcByGridMes = new Map()
      for (const v of vc) {
        if (!vcByGridMes.has(String(v.grupo_grid))) vcByGridMes.set(String(v.grupo_grid), new Map())
        vcByGridMes.get(String(v.grupo_grid))!.set(v.mes, {
          total_venda: Number(v.total_venda),
          total_custo: Number(v.total_custo),
        })
      }
    }
    // Agora soma por mês todos os mapeamentos das linhas relevantes
    function totalLinhaMes(linhaId: string, mes: string): number {
      let s = 0
      for (const cg of contasPorLinha.get(linhaId) ?? []) {
        const det = contasDetalhe.get(cg); if (!det) continue
        s += balPorPaiMes.get(det.codigo)?.get(mes) ?? 0
      }
      for (const gm of gruposPorLinha.get(linhaId) ?? []) {
        const d = vcByGridMes.get(gm.grupo_grid)?.get(mes)
        if (!d) continue
        s += gm.tipo_valor === 'venda' ? d.total_venda : d.total_custo
      }
      return s
    }

    const ultimos_12_meses: GraficoMesItem[] = mesesISO.map(mes => {
      let total = 0
      for (const m of marcadas) {
        total += totalLinhaMes(m.id, mes)
        for (const d of descsPorMarcada.get(m.id) ?? []) total += totalLinhaMes(d.id, mes)
      }
      return { mes, total }
    })

    // ── 5. Breakdown por empresa (para o gráfico filtrado por sub-grupo) ──
    // Cada sub-grupo (descendente DFS de uma linha marcada) vira uma entrada.
    // Para cada sub-grupo, fazemos N chamadas (uma por empresa) — empresarial,
    // a janela é a mesma de 12 meses pra ser comparável ao gráfico anterior.
    const empresas = await buscarEmpresasComNomeReduzido()
    const empresaNome = new Map<number, string>()
    for (const e of empresas) empresaNome.set(Number(e.grid), e.nome_reduzido || e.nome)

    // Pré-agregação por (empresa, codigo) — usa as queries por_empresa+codigo
    // numa só passagem para evitar N×M consultas.
    const balPorEmpresaPai = new Map<number, Map<string, number>>()
    for (const empId of empresaIds) {
      const m = await aggregarMovtoPorContaPorMes([empId], dataIni, dataFim, todosCodigosExp)
      const acc = new Map<string, number>()
      for (const r of m) {
        const parent = codigoToParent.get(r.codigo) ?? r.codigo
        const bal = Number(r.total_creditar) - Number(r.total_debitar)
        acc.set(parent, (acc.get(parent) ?? 0) + bal)
      }
      balPorEmpresaPai.set(empId, acc)
    }
    // Grupos de produto — idem
    const vcPorEmpresaGrid = new Map<number, Map<string, { total_venda: number; total_custo: number }>>()
    if (todosGrupoGrids.size > 0) {
      for (const empId of empresaIds) {
        const vc = await aggregarVendasCustosPorGrupoPorMes(
          [empId], dataIni, dataFim, Array.from(todosGrupoGrids),
        )
        const acc = new Map<string, { total_venda: number; total_custo: number }>()
        for (const v of vc) {
          const cur = acc.get(String(v.grupo_grid)) ?? { total_venda: 0, total_custo: 0 }
          cur.total_venda += Number(v.total_venda)
          cur.total_custo += Number(v.total_custo)
          acc.set(String(v.grupo_grid), cur)
        }
        vcPorEmpresaGrid.set(empId, acc)
      }
    }

    function totalLinhaEmpresa(linhaId: string, empresaId: number): number {
      let s = 0
      for (const cg of contasPorLinha.get(linhaId) ?? []) {
        const det = contasDetalhe.get(cg); if (!det) continue
        s += balPorEmpresaPai.get(empresaId)?.get(det.codigo) ?? 0
      }
      for (const gm of gruposPorLinha.get(linhaId) ?? []) {
        const d = vcPorEmpresaGrid.get(empresaId)?.get(gm.grupo_grid)
        if (!d) continue
        s += gm.tipo_valor === 'venda' ? d.total_venda : d.total_custo
      }
      return s
    }

    // Para cada sub-grupo descendente (achata DFS de todas as marcadas)
    const por_empresa: GraficoSubgrupo[] = []
    for (const marc of marcadas) {
      const descs = descsPorMarcada.get(marc.id) ?? []
      // Inclui também a própria marcada (caso tenha mapeamentos diretos)
      const candidatos: LinhaDB[] = [marc, ...descs]
      for (const linha of candidatos) {
        const por_emp: GraficoEmpresa[] = []
        let total = 0
        for (const empId of empresaIds) {
          const v = totalLinhaEmpresa(linha.id, empId)
          if (Math.abs(v) > 0.005) {
            por_emp.push({
              empresa_id:   empId,
              empresa_nome: empresaNome.get(empId) ?? String(empId),
              total:        v,
            })
            total += v
          }
        }
        if (por_emp.length > 0) {
          por_empresa.push({
            linha_id:    linha.id,
            linha_nome:  linha === marc ? marc.nome : `${marc.nome} · ${linha.nome}`,
            total,
            por_empresa: por_emp.sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
          })
        }
      }
    }

    const resp: AnaliseDespesasGraficosResponse = {
      ultimos_12_meses,
      por_empresa,
    }
    return NextResponse.json(resp)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao consultar AUTOSYSTEM'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
