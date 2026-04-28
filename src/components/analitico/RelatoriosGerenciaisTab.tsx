'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Loader2, FileBarChart, AlertCircle, Calendar, Equal,
  ChevronRight, ChevronDown, FileText, Boxes,
  Building2, TrendingDown, Wallet, Hourglass, Eye, EyeOff,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils/cn'
import type { Mascara } from '@/types/database.types'
import type { DreLinhaResultado, DreResponse, ResultadoEmpresa } from '@/app/api/relatorios/dre/route'
import type {
  DrillLinhaResponse, DrillLancamentosResponse,
  DrillItem, DrillLancamento,
} from '@/app/api/relatorios/dre/drill/route'
import { BalancoFinanceiroView } from './BalancoFinanceiroView'

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

const fmtMes = (iso: string) => {
  const [y, m] = iso.split('-')
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${meses[Number(m) - 1]}/${y.slice(2)}`
}

const fmtData = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

type PeriodoMeses = 1 | 3 | 6
const PERIODOS: { meses: PeriodoMeses; label: string }[] = [
  { meses: 1, label: '1 mês'  },
  { meses: 3, label: '3 meses' },
  { meses: 6, label: '6 meses' },
]

// Linhas mapeadas a grupos de produto cujo drill produziria milhares de lançamentos
// individuais sem ganho informacional — bloqueamos a expansão delas.
function normalizarNome(s: string): string {
  // Remove diacríticos (acentos) e normaliza para comparação case-insensitive
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase()
}

const LINHAS_SEM_EXPANSAO = new Set([
  'VENDA DE COMBUSTIVEIS',
  'VENDA DE LOJAS DE CONVENIENCIA',
  'VENDA DE PRODUTOS AUTOMOTIVOS',
  'CUSTO DOS COMBUSTIVEIS REVENDIDOS',
  'CUSTO DAS MERCADORIAS DA CONVENIENCIA',
  'CUSTO DOS PRODUTOS AUTOMOTIVOS',
].map(normalizarNome))

// Tipos de chave de expansão
//   linha:<id>      → drill nível 1 (mostra contas/grupos da linha)
//   conta:<codigo>  → drill nível 2 (lançamentos da conta)
//   grupo:<grid>:<tipo_valor>  → drill nível 2 (lançamentos do grupo)

type DrillCache = Map<string, DrillItem[] | DrillLancamento[]>

type SubAba = 'dre' | 'fluxo' | 'despesas' | 'balanco'
const SUB_ABAS: { key: SubAba; label: string; icon: React.ElementType }[] = [
  { key: 'dre',       label: 'DRE',                  icon: FileBarChart },
  { key: 'fluxo',     label: 'Fluxo de Caixa',       icon: Wallet       },
  { key: 'despesas',  label: 'Análise de Despesas',  icon: TrendingDown },
  { key: 'balanco',   label: 'Balanço Financeiro',   icon: Building2    },
]

const fmtPct = (v: number) => `${v.toFixed(1).replace('.', ',')}%`

export function RelatoriosGerenciaisTab() {
  const supabase = createClient()
  const [subAba, setSubAba] = useState<SubAba>('dre')

  const [mascaras, setMascaras]               = useState<Mascara[]>([])
  const [loadingMascaras, setLoadingMascaras] = useState(true)
  const [mascaraId, setMascaraId]             = useState<string | null>(null)
  const [periodo, setPeriodo]                 = useState<PeriodoMeses>(3)
  // Mês de referência (YYYY-MM). Define o último mês incluído no relatório.
  // Exemplo: ref=2026-03 + periodo=3 → janeiro, fevereiro, março de 2026.
  const [refMesAno, setRefMesAno] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const [resp, setResp]                       = useState<DreResponse | null>(null)
  const [loadingDre, setLoadingDre]           = useState(false)
  const [erro, setErro]                       = useState<string | null>(null)

  const [expanded, setExpanded]               = useState<Set<string>>(new Set())
  const [drillCache, setDrillCache]           = useState<DrillCache>(new Map())
  const [loadingDrill, setLoadingDrill]       = useState<Set<string>>(new Set())
  const [drillError, setDrillError]           = useState<Map<string, string>>(new Map())
  // Esconde contas/grupos sem movimento dentro dos drills (total === 0 em todos os meses)
  const [ocultarZerados, setOcultarZerados]   = useState(true)

  // Carrega máscaras DRE
  useEffect(() => {
    let cancel = false
    supabase
      .from('mascaras')
      .select('*')
      .eq('tipo', 'dre')
      .order('nome')
      .then(({ data, error }) => {
        if (cancel) return
        if (error) {
          setErro(error.message)
          setLoadingMascaras(false)
          return
        }
        const ms = (data ?? []) as Mascara[]
        setMascaras(ms)
        if (ms.length > 0) setMascaraId(ms[0].id)
        setLoadingMascaras(false)
      })
    return () => { cancel = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function gerarRelatorio() {
    if (!mascaraId) return
    setLoadingDre(true)
    setErro(null)
    setResp(null)
    setExpanded(new Set())
    setDrillCache(new Map())
    try {
      const r = await fetch(`/api/relatorios/dre?mascara_id=${mascaraId}&periodo=${periodo}&ref=${refMesAno}`)
      const json = await r.json()
      if (!r.ok || json.error) setErro(json.error ?? `Erro HTTP ${r.status}`)
      else setResp(json as DreResponse)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingDre(false)
    }
  }

  // ── Expand / Drill-down ─────────────────────────────────
  async function toggleExpand(key: string) {
    if (expanded.has(key)) {
      setExpanded(prev => {
        const n = new Set(prev); n.delete(key); return n
      })
      return
    }
    // Expandindo — verifica cache
    if (!drillCache.has(key)) {
      await fetchDrill(key)
    }
    setExpanded(prev => new Set(prev).add(key))
  }

  async function fetchDrill(key: string) {
    setLoadingDrill(prev => new Set(prev).add(key))
    setDrillError(prev => { const n = new Map(prev); n.delete(key); return n })
    try {
      const url = buildDrillUrl(key, mascaraId!, periodo)
      const r = await fetch(url)
      const json = await r.json()
      if (!r.ok || json.error) {
        const msg = json.error ?? `Erro HTTP ${r.status}`
        setDrillError(prev => new Map(prev).set(key, msg))
        return
      }
      if (json.modo === 'linha') {
        const data = json as DrillLinhaResponse
        setDrillCache(prev => new Map(prev).set(key, data.itens))
      } else if (json.modo === 'lancamentos') {
        const data = json as DrillLancamentosResponse
        setDrillCache(prev => new Map(prev).set(key, data.lancamentos))
      }
    } catch (e) {
      setDrillError(prev => new Map(prev).set(key, e instanceof Error ? e.message : String(e)))
    } finally {
      setLoadingDrill(prev => { const n = new Set(prev); n.delete(key); return n })
    }
  }

  function buildDrillUrl(key: string, mascId: string, per: PeriodoMeses): string {
    const ref = `&ref=${refMesAno}`
    if (key.startsWith('linha:')) {
      const id = key.slice(6)
      return `/api/relatorios/dre/drill?mode=linha&linha_id=${id}&mascara_id=${mascId}&periodo=${per}${ref}`
    }
    if (key.startsWith('conta:')) {
      const codigo = key.slice(6)
      return `/api/relatorios/dre/drill?mode=lancamentos&target=conta&codigo=${encodeURIComponent(codigo)}&periodo=${per}${ref}`
    }
    if (key.startsWith('grupo:')) {
      const [, grupoGrid, tipoValor] = key.split(':')
      return `/api/relatorios/dre/drill?mode=lancamentos&target=grupo&grupo_grid=${grupoGrid}&tipo_valor=${tipoValor}&periodo=${per}${ref}`
    }
    return ''
  }

  const meses = resp?.meses ?? []

  // Resultado final = último subtotal raiz (se existir)
  const resultadoFinal = useMemo(() => {
    if (!resp) return null
    const raizes = resp.linhas.filter(l => l.depth === 0)
    const ultimo = [...raizes].reverse().find(l => l.tipo_linha === 'subtotal')
    return ultimo ?? null
  }, [resp])

  // Receita bruta para análise vertical = primeira linha-grupo no nível raiz com valor != 0.
  // Usado como base de comparação (100%) para todas as outras linhas.
  const receitaBruta = useMemo(() => {
    if (!resp) return null
    return resp.linhas.find(l => l.depth === 0 && l.tipo_linha === 'grupo' && l.total !== 0) ?? null
  }, [resp])

  return (
    <div className="space-y-4">
      {/* Sub-tabs internas (DRE / Fluxo / Despesas / Balanço) */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {SUB_ABAS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSubAba(key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors',
              subAba === key
                ? 'border-[#8b1a14] text-[#8b1a14]'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {subAba === 'balanco' && <BalancoFinanceiroView />}

      {(subAba === 'fluxo' || subAba === 'despesas') && (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center bg-white rounded-xl border border-dashed border-gray-300">
          <Hourglass className="w-10 h-10 text-gray-300" />
          <div>
            <p className="text-[15px] font-semibold text-gray-700">Em breve</p>
            <p className="text-[12.5px] text-gray-500 mt-1">
              {subAba === 'fluxo'    && 'O relatório de Fluxo de Caixa estará disponível em uma próxima atualização.'}
              {subAba === 'despesas' && 'A Análise de Despesas estará disponível em uma próxima atualização.'}
            </p>
          </div>
        </div>
      )}

      {subAba === 'dre' && <>
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl bg-white border border-gray-200">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
            Máscara DRE
          </label>
          <select
            value={mascaraId ?? ''}
            onChange={(e) => setMascaraId(e.target.value || null)}
            disabled={loadingMascaras || !mascaras.length}
            className="w-full h-10 px-3 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
          >
            {loadingMascaras
              ? <option>Carregando…</option>
              : !mascaras.length
                ? <option>Nenhuma máscara DRE cadastrada</option>
                : mascaras.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
            Mês/Ano de referência
          </label>
          <input
            type="month"
            value={refMesAno}
            onChange={(e) => setRefMesAno(e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
            Período
          </label>
          <div className="flex border border-gray-300 rounded-lg overflow-hidden">
            {PERIODOS.map(p => (
              <button
                key={p.meses}
                onClick={() => setPeriodo(p.meses)}
                className={cn(
                  'h-10 px-4 text-[13px] font-medium transition-colors',
                  periodo === p.meses
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={gerarRelatorio}
          disabled={!mascaraId || loadingDre}
          className="h-10 px-4 rounded-lg bg-gray-900 text-white text-[13px] font-semibold hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loadingDre
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando…</>
            : <><FileBarChart className="w-4 h-4" /> Gerar relatório</>}
        </button>
      </div>

      {/* Erro */}
      {erro && (
        <div className="flex items-start gap-2 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px]">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Erro</p>
            <p className="text-[12px] opacity-80">{erro}</p>
          </div>
        </div>
      )}

      {/* Loading inicial */}
      {loadingDre && !resp && (
        <div className="flex justify-center py-12 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}

      {/* Tabela DRE */}
      {resp && !loadingDre && (
        <div className="rounded-xl bg-white border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <FileBarChart className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-[14px] font-semibold text-gray-900">
                {mascaras.find(m => m.id === mascaraId)?.nome ?? 'DRE'}
              </h3>
              <p className="text-[11.5px] text-gray-500 flex items-center gap-1.5">
                <Calendar className="w-3 h-3" />
                {fmtData(resp.periodo.dataIni)} a {fmtData(resp.periodo.dataFim)} • {resp.empresas} {resp.empresas === 1 ? 'empresa' : 'empresas'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOcultarZerados(v => !v)}
              title={ocultarZerados ? 'Mostrar todas as contas' : 'Ocultar contas sem movimento'}
              className={cn(
                'flex items-center gap-1.5 h-9 px-3 rounded-lg text-[12px] font-medium border transition-colors flex-shrink-0',
                ocultarZerados
                  ? 'bg-[#8b1a14] text-white border-[#8b1a14] hover:bg-[#6e1410]'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              )}
            >
              {ocultarZerados ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {ocultarZerados ? 'Ocultando zerados' : 'Mostrando todas'}
            </button>
            {resultadoFinal && (
              <div className="text-right">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">{resultadoFinal.nome}</p>
                <p className={cn(
                  'text-[20px] font-bold tabular-nums',
                  resultadoFinal.total >= 0 ? 'text-emerald-600' : 'text-rose-600'
                )}>
                  {fmtBRL(resultadoFinal.total)}
                </p>
              </div>
            )}
          </div>

          {!resp.linhas.length ? (
            <p className="text-center py-12 text-[13px] text-gray-500">
              Esta máscara não possui linhas cadastradas.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th rowSpan={2} className="text-left px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10.5px] sticky left-0 bg-gray-50 z-10 min-w-[280px] border-b border-gray-200">
                      Linha
                    </th>
                    {meses.map(mes => (
                      <th key={mes} colSpan={2} className="text-center px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide text-[10.5px] min-w-[180px] border-b border-gray-200">
                        {fmtMes(mes)}
                      </th>
                    ))}
                    <th colSpan={2} className="text-center px-4 py-2 font-semibold text-gray-500 uppercase tracking-wide text-[10.5px] min-w-[200px] bg-gray-100 border-b border-gray-200">
                      Total
                    </th>
                  </tr>
                  <tr>
                    {meses.flatMap(mes => [
                      <th key={`${mes}-v`} className="text-right px-3 pb-2 pt-0 font-medium text-gray-400 uppercase tracking-wide text-[9.5px] min-w-[110px]">
                        Valor
                      </th>,
                      <th key={`${mes}-av`} className="text-right px-2 pb-2 pt-0 font-medium text-gray-400 uppercase tracking-wide text-[9.5px] min-w-[60px]"
                          title={receitaBruta ? `% da ${receitaBruta.nome} no mês` : 'Análise vertical'}>
                        AV%
                      </th>,
                    ])}
                    <th className="text-right px-3 pb-2 pt-0 font-medium text-gray-400 uppercase tracking-wide text-[9.5px] min-w-[120px] bg-gray-100">
                      Valor
                    </th>
                    <th className="text-right px-2 pb-2 pt-0 font-medium text-gray-400 uppercase tracking-wide text-[9.5px] min-w-[60px] bg-gray-100"
                        title={receitaBruta ? `% da ${receitaBruta.nome} no total` : 'Análise vertical'}>
                      AV%
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {resp.linhas.map(linha => (
                    <DreRow
                      key={linha.id}
                      linha={linha}
                      meses={meses}
                      receitaBruta={receitaBruta}
                      ocultarZerados={ocultarZerados}
                      expanded={expanded}
                      drillCache={drillCache}
                      loadingDrill={loadingDrill}
                      drillError={drillError}
                      onToggle={toggleExpand}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!resp && !loadingDre && !erro && (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-gray-400">
          <FileBarChart className="w-10 h-10 opacity-40" />
          <p className="text-[13px]">Selecione uma máscara e período, depois clique em &quot;Gerar relatório&quot;</p>
        </div>
      )}

      {/* Resultado por empresa */}
      {resp && !loadingDre && resp.resultadoPorEmpresa.length > 0 && (
        <div className="rounded-xl bg-white border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-[14px] font-semibold text-gray-900">Resultado por empresa</h3>
              <p className="text-[11.5px] text-gray-500">
                Participação de cada empresa no resultado líquido do exercício
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10.5px]">Empresa</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10.5px] min-w-[160px]">Resultado Líquido</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10.5px] min-w-[120px]">Participação</th>
                </tr>
              </thead>
              <tbody>
                {resp.resultadoPorEmpresa.map(emp => (
                  <tr key={emp.empresa_id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2 text-gray-800 uppercase tracking-tight">{emp.empresa_nome}</td>
                    <td className={cn(
                      'px-4 py-2 text-right tabular-nums font-semibold',
                      emp.valor < 0 ? 'text-rose-700' : 'text-emerald-700',
                    )}>
                      {fmtBRL(emp.valor)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-700">
                      {fmtPct(emp.participacao_pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>}
    </div>
  )
}

// ─── Linha da DRE ─────────────────────────────────────────────

interface DreRowProps {
  linha:          DreLinhaResultado
  meses:          string[]
  receitaBruta:   DreLinhaResultado | null
  ocultarZerados: boolean
  expanded:       Set<string>
  drillCache:     DrillCache
  loadingDrill:   Set<string>
  drillError:     Map<string, string>
  onToggle:       (key: string) => void
}

function DreRow({ linha, meses, receitaBruta, ocultarZerados, expanded, drillCache, loadingDrill, drillError, onToggle }: DreRowProps) {
  const isSubtotal = linha.tipo_linha === 'subtotal'
  const nomeBloqueado = LINHAS_SEM_EXPANSAO.has(normalizarNome(linha.nome))
  const podeExpandir = linha.tem_mapeamento && !isSubtotal && !nomeBloqueado
  const key = `linha:${linha.id}`
  const isOpen = expanded.has(key)
  const isLoading = loadingDrill.has(key)
  const drillItensRaw = (drillCache.get(key) ?? []) as DrillItem[]
  // Quando "ocultarZerados" está ativo, esconde itens drill (contas/grupos) sem movimento.
  const drillItens = ocultarZerados
    ? drillItensRaw.filter(it => it.total !== 0 || it.valoresPorMes.some(v => v !== 0))
    : drillItensRaw
  const ocultos = drillItensRaw.length - drillItens.length

  return (
    <>
      <tr className={cn(
        'border-b border-gray-100 hover:bg-gray-50 transition-colors',
        isSubtotal && 'bg-gray-50 hover:bg-gray-100',
      )}>
        <td className="px-4 py-2 sticky left-0 bg-inherit z-10" style={{ paddingLeft: 16 + linha.depth * 20 }}>
          <div className="flex items-center gap-2">
            {podeExpandir ? (
              <button onClick={() => onToggle(key)} className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 flex-shrink-0">
                {isLoading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <span className="w-5 h-5 flex-shrink-0">
                {isSubtotal && <Equal className="w-3.5 h-3.5 text-purple-500" />}
              </span>
            )}
            <span className={cn(
              'truncate uppercase tracking-tight',
              isSubtotal ? 'font-semibold text-gray-900' : 'text-gray-700',
            )}>
              {linha.nome}
            </span>
          </div>
        </td>
        {meses.flatMap((mes, i) => {
          const v = linha.valoresPorMes[i] ?? 0
          const rb = receitaBruta?.valoresPorMes[i] ?? 0
          return [
            <td key={`${mes}-v`} className={cn(
              'px-3 py-2 text-right tabular-nums',
              isSubtotal ? 'font-semibold' : '',
              v < 0 ? 'text-rose-600' : 'text-gray-900',
            )}>
              {fmtBRL(v)}
            </td>,
            <td key={`${mes}-av`} className={cn(
              'px-2 py-2 text-right tabular-nums text-[11.5px]',
              isSubtotal ? 'font-semibold text-gray-700' : 'text-gray-500',
            )}>
              {rb !== 0 ? fmtPct((v / rb) * 100) : '—'}
            </td>,
          ]
        })}
        <td className={cn(
          'px-4 py-2 text-right tabular-nums bg-gray-50',
          isSubtotal ? 'font-bold' : 'font-semibold',
          linha.total < 0 ? 'text-rose-700' : 'text-emerald-700',
        )}>
          {fmtBRL(linha.total)}
        </td>
        <td className={cn(
          'px-2 py-2 text-right tabular-nums bg-gray-50 text-[11.5px]',
          isSubtotal ? 'font-bold text-gray-700' : 'text-gray-500',
        )}>
          {receitaBruta && receitaBruta.total !== 0
            ? fmtPct((linha.total / receitaBruta.total) * 100)
            : '—'}
        </td>
      </tr>

      {/* Erro do drill nível 1 */}
      {isOpen && drillError.has(key) && (
        <tr className="border-b border-gray-100 bg-red-50">
          <td colSpan={meses.length * 2 + 3} className="px-4 py-3 text-[12px] text-red-700"
              style={{ paddingLeft: 16 + (linha.depth + 1) * 20 }}>
            <span className="font-medium">Erro: </span>{drillError.get(key)}
          </td>
        </tr>
      )}

      {/* Drill nível 1: contas / grupos mapeados */}
      {isOpen && drillItens.map(item => (
        <DrillItemRow
          key={item.tipo === 'conta' ? `c:${item.conta_grid}` : `g:${item.grupo_grid}:${item.tipo_valor}`}
          item={item}
          meses={meses}
          baseDepth={linha.depth}
          receitaBruta={receitaBruta}
          expanded={expanded}
          drillCache={drillCache}
          loadingDrill={loadingDrill}
          drillError={drillError}
          onToggle={onToggle}
        />
      ))}

      {/* Indicador de contas ocultadas */}
      {isOpen && !drillError.has(key) && ocultos > 0 && (
        <tr className="border-b border-gray-100 bg-blue-50/20">
          <td colSpan={meses.length * 2 + 3} className="px-4 py-1.5 text-[11px] text-gray-400 italic"
              style={{ paddingLeft: 16 + (linha.depth + 1) * 20 }}>
            {ocultos} {ocultos === 1 ? 'conta sem movimento ocultada' : 'contas sem movimento ocultadas'}
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Drill nível 1: conta ou grupo mapeado ────────────────────

interface DrillItemRowProps {
  item:         DrillItem
  meses:        string[]
  baseDepth:    number
  receitaBruta: DreLinhaResultado | null
  expanded:     Set<string>
  drillCache:   DrillCache
  loadingDrill: Set<string>
  drillError:   Map<string, string>
  onToggle:     (key: string) => void
}

function DrillItemRow({ item, meses, baseDepth, receitaBruta, expanded, drillCache, loadingDrill, drillError, onToggle }: DrillItemRowProps) {
  const key = item.tipo === 'conta'
    ? `conta:${item.codigo}`
    : `grupo:${item.grupo_grid}:${item.tipo_valor}`
  const isOpen = expanded.has(key)
  const isLoading = loadingDrill.has(key)
  const lancs = (drillCache.get(key) ?? []) as DrillLancamento[]

  // Ícone só nos grupos de produto (verde p/ venda, vermelho p/ custo); contas vão sem ícone
  const showIcon  = item.tipo === 'grupo'
  const iconColor = item.tipo === 'grupo'
    ? (item.tipo_valor === 'venda' ? 'text-emerald-600' : 'text-rose-600')
    : ''

  return (
    <>
      <tr className="border-b border-gray-100 bg-blue-50/30 hover:bg-blue-50/60 transition-colors">
        <td className="px-4 py-1.5 sticky left-0 bg-inherit z-10" style={{ paddingLeft: 16 + (baseDepth + 1) * 20 }}>
          <div className="flex items-center gap-2">
            <button onClick={() => onToggle(key)} className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 flex-shrink-0">
              {isLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            {showIcon && <Boxes className={cn('w-3.5 h-3.5 flex-shrink-0', iconColor)} />}
            <span className="text-[11.5px] font-mono text-gray-400 flex-shrink-0">
              {item.codigo}
            </span>
            <span className="flex-1 truncate text-[12px] text-gray-700">
              {item.nome}
            </span>
            {item.tipo === 'grupo' && (
              <span className={cn(
                'text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded flex-shrink-0',
                item.tipo_valor === 'venda'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-rose-100 text-rose-700'
              )}>
                {item.tipo_valor}
              </span>
            )}
          </div>
        </td>
        {meses.flatMap((mes, i) => {
          const v = item.valoresPorMes[i] ?? 0
          const rb = receitaBruta?.valoresPorMes[i] ?? 0
          return [
            <td key={`${mes}-v`} className={cn(
              'px-3 py-1.5 text-right tabular-nums text-[12px]',
              v < 0 ? 'text-rose-600' : 'text-gray-700',
            )}>
              {fmtBRL(v)}
            </td>,
            <td key={`${mes}-av`} className="px-2 py-1.5 text-right tabular-nums text-[11px] text-gray-500">
              {rb !== 0 ? fmtPct((v / rb) * 100) : '—'}
            </td>,
          ]
        })}
        <td className={cn(
          'px-4 py-1.5 text-right tabular-nums text-[12px] bg-gray-50 font-medium',
          item.total < 0 ? 'text-rose-700' : 'text-emerald-700',
        )}>
          {fmtBRL(item.total)}
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums text-[11px] bg-gray-50 text-gray-500">
          {receitaBruta && receitaBruta.total !== 0
            ? fmtPct((item.total / receitaBruta.total) * 100)
            : '—'}
        </td>
      </tr>

      {/* Drill nível 2: erro ou vazio */}
      {isOpen && drillError.has(key) && (
        <tr className="border-b border-gray-100 bg-red-50">
          <td colSpan={meses.length * 2 + 3} className="px-4 py-3 text-[11.5px] text-red-700"
              style={{ paddingLeft: 16 + (baseDepth + 2) * 20 }}>
            <span className="font-medium">Erro: </span>{drillError.get(key)}
          </td>
        </tr>
      )}
      {isOpen && !drillError.has(key) && lancs.length === 0 && (
        <tr className="border-b border-gray-100 bg-gray-50/40">
          <td colSpan={meses.length * 2 + 3} className="px-4 py-3 text-center text-[11.5px] text-gray-500"
              style={{ paddingLeft: 16 + (baseDepth + 2) * 20 }}>
            Nenhum lançamento no período
          </td>
        </tr>
      )}
      {isOpen && lancs.map((l, idx) => (
        <LancamentoRow
          key={`${key}:${idx}`}
          lanc={l}
          meses={meses}
          baseDepth={baseDepth}
        />
      ))}
    </>
  )
}

// ─── Drill nível 2: lançamento individual ─────────────────────

function LancamentoRow({ lanc, meses, baseDepth }: {
  lanc: DrillLancamento
  meses: string[]
  baseDepth: number
}) {
  // A coluna onde o valor aparece é determinada pela data (interna), mas a data não é exibida.
  const idxMes = meses.indexOf(lanc.data.slice(0, 7))

  return (
    <tr className="border-b border-gray-100 bg-white hover:bg-gray-50 transition-colors">
      <td className="px-4 py-1 sticky left-0 bg-inherit z-10" style={{ paddingLeft: 16 + (baseDepth + 2) * 20 }}>
        <div className="flex items-center gap-2 text-[11.5px] text-gray-600">
          <FileText className="w-3 h-3 flex-shrink-0 text-gray-300" />
          <span className="truncate text-gray-700">
            {lanc.observacao && lanc.observacao.trim()
              ? lanc.observacao
              : <span className="italic text-gray-400">(sem observação)</span>}
          </span>
        </div>
      </td>
      {meses.flatMap((mes, i) => [
        <td key={`${mes}-v`} className={cn(
          'px-3 py-1 text-right tabular-nums text-[11.5px]',
          i === idxMes
            ? lanc.valor < 0 ? 'text-rose-600' : 'text-gray-700'
            : 'text-gray-300',
        )}>
          {i === idxMes ? fmtBRL(lanc.valor) : '—'}
        </td>,
        // AV% por mês — não aplicável a lançamento individual; célula vazia mantém alinhamento
        <td key={`${mes}-av`} className="px-2 py-1" />,
      ])}
      <td className={cn(
        'px-4 py-1 text-right tabular-nums text-[11.5px] bg-gray-50',
        lanc.valor < 0 ? 'text-rose-700' : 'text-gray-600',
      )}>
        {fmtBRL(lanc.valor)}
      </td>
      <td className="px-2 py-1 bg-gray-50" />
    </tr>
  )
}
