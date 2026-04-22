'use client'

import { useCallback, useEffect, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { toast } from '@/hooks/use-toast'
import { useAuthContext } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils/cn'
import {
  Loader2, Save, RefreshCw, Droplets, ArrowLeft,
  AlertTriangle, CalendarDays, LayoutGrid, CheckCircle2, XCircle, Clock,
} from 'lucide-react'
import type { Role } from '@/types/database.types'

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface Tanque {
  id: string
  posto_nome: string
  bandeira: string
  produto: string
  capacidade_litros: number
  ordem: number
  medida_litros: number | null
}

type DiaInfo = { preenchidos: number; total: number }
type HistoricoData = {
  dias: string[]
  porPosto: Record<string, Record<string, DiaInfo>>
  totalPorPosto: Record<string, number>
}

// ── Constantes ─────────────────────────────────────────────────────────────────

const PRODUTOS_ORDEM = ['G.C', 'G.A', 'ETANOL', 'E.T', 'D.C', 'D.S-10', 'G.R']

const PRODUTO_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  'G.C':    { label: 'G.C',   bg: 'bg-yellow-50',  text: 'text-yellow-800' },
  'G.A':    { label: 'G.A',   bg: 'bg-amber-50',   text: 'text-amber-800'  },
  'ETANOL': { label: 'ETN',   bg: 'bg-green-50',   text: 'text-green-800'  },
  'E.T':    { label: 'E.T',   bg: 'bg-green-50',   text: 'text-green-800'  },
  'D.C':    { label: 'D.C',   bg: 'bg-blue-50',    text: 'text-blue-800'   },
  'D.S-10': { label: 'DS10',  bg: 'bg-sky-50',     text: 'text-sky-800'    },
  'D.S10':  { label: 'DS10',  bg: 'bg-sky-50',     text: 'text-sky-800'    },
  'G.R':    { label: 'G.R',   bg: 'bg-red-50',     text: 'text-red-800'    },
}

const BANDEIRA_BADGE: Record<string, string> = {
  'BR':             'bg-blue-100 text-blue-700',
  'SHELL':          'bg-yellow-100 text-yellow-700',
  'SHELL/IPIRANGA': 'bg-orange-100 text-orange-700',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getProdutoCfg(p: string) {
  return PRODUTO_CONFIG[p] ?? { label: p, bg: 'bg-gray-50', text: 'text-gray-700' }
}
function fmtL(n: number) { return n.toLocaleString('pt-BR') }
function today() { return new Date().toISOString().slice(0, 10) }

function fmtDiaSemana(iso: string) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
}
function fmtDiaMes(iso: string) {
  const [, , d] = iso.split('-')
  return d
}
function fmtMes(iso: string) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
}

function pctColor(pct: number | null) {
  if (pct === null) return 'text-gray-300'
  if (pct < 20) return 'text-red-600 font-bold'
  if (pct < 40) return 'text-amber-600 font-semibold'
  return 'text-emerald-600 font-semibold'
}
function pctBg(pct: number | null) {
  if (pct === null) return 'bg-gray-100'
  if (pct < 20) return 'bg-red-50 border-red-200'
  if (pct < 40) return 'bg-amber-50 border-amber-200'
  return 'bg-emerald-50 border-emerald-200'
}
function barColor(pct: number) {
  if (pct < 20) return 'bg-red-500'
  if (pct < 40) return 'bg-amber-400'
  return 'bg-emerald-500'
}

// Compliance de um dia: cor da célula no heat-map
function complianceCls(info: DiaInfo | undefined, isToday: boolean, isPast: boolean) {
  if (!info || info.total === 0) return 'bg-gray-100 text-gray-300'
  const { preenchidos, total } = info
  if (preenchidos === 0) {
    if (isToday) return 'bg-amber-100 text-amber-500'   // ainda pode preencher hoje
    if (isPast)  return 'bg-red-100 text-red-500'        // faltou
    return 'bg-gray-100 text-gray-300'                   // futuro
  }
  if (preenchidos < total) return 'bg-amber-100 text-amber-600'  // parcial
  return 'bg-emerald-100 text-emerald-600'                         // completo
}

function compliancePct(porDia: Record<string, DiaInfo>, dias: string[], todayStr: string) {
  const passados = dias.filter(d => d <= todayStr)
  if (passados.length === 0) return null
  const cheios = passados.filter(d => {
    const info = porDia[d]
    return info && info.preenchidos > 0 && info.preenchidos === info.total
  }).length
  return Math.round((cheios / passados.length) * 100)
}

// ── Resumo de posto ────────────────────────────────────────────────────────────

interface PostoResumo {
  posto_nome: string
  bandeira: string
  produtos: Record<string, { pct: number | null; medida: number | null; capacidade: number }>
  pctGeral: number | null
  semMedicao: number
  totalCap: number
  totalMed: number
}

function buildResumo(tanques: Tanque[], medicoes: Record<string, string>): PostoResumo[] {
  const map: Record<string, PostoResumo> = {}
  for (const t of tanques) {
    if (!map[t.posto_nome]) {
      map[t.posto_nome] = {
        posto_nome: t.posto_nome, bandeira: t.bandeira, produtos: {},
        pctGeral: null, semMedicao: 0, totalCap: 0, totalMed: 0,
      }
    }
    const raw = medicoes[t.id]
    const medida = raw !== undefined && raw !== '' ? parseInt(raw, 10) : t.medida_litros
    const pct = medida !== null && t.capacidade_litros > 0
      ? Math.min(100, Math.round((medida / t.capacidade_litros) * 100)) : null
    map[t.posto_nome].produtos[t.produto] = { pct, medida, capacidade: t.capacidade_litros }
    map[t.posto_nome].totalCap += t.capacidade_litros
    map[t.posto_nome].totalMed += medida ?? 0
    if (medida === null) map[t.posto_nome].semMedicao++
  }
  return Object.values(map).map(r => ({
    ...r,
    pctGeral: r.totalCap > 0 ? Math.round((r.totalMed / r.totalCap) * 100) : null,
  })).sort((a, b) => (a.pctGeral ?? 999) - (b.pctGeral ?? 999))
}

// ── Mini célula de produto ─────────────────────────────────────────────────────

function ProdCell({ info }: { info: { pct: number | null; medida: number | null; capacidade: number } | undefined }) {
  if (!info) return <td className="px-2 py-2 text-center text-gray-200 text-[11px]">—</td>
  const { pct, medida } = info
  return (
    <td className={cn('px-2 py-2 text-center border-l border-gray-100', pct !== null ? pctBg(pct) : '')}>
      <div className="flex flex-col items-center gap-0.5">
        <span className={cn('text-[11px]', pctColor(pct))}>{pct !== null ? `${pct}%` : '—'}</span>
        {pct !== null && (
          <div className="w-10 h-1 rounded-full bg-gray-200 overflow-hidden">
            <div className={cn('h-full rounded-full', barColor(pct))} style={{ width: `${pct}%` }} />
          </div>
        )}
        {medida !== null && <span className="text-[9px] text-gray-400">{fmtL(medida)}L</span>}
      </div>
    </td>
  )
}

// ── Tira de dias (gerente) ────────────────────────────────────────────────────

function TiraDias({
  historico, postoNome, todayStr, onSelectDia,
}: {
  historico: HistoricoData | null
  postoNome: string
  todayStr: string
  onSelectDia: (d: string) => void
}) {
  if (!historico) return null
  const dias = historico.dias.slice(0, 14)
  const porDia = historico.porPosto[postoNome] ?? {}

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <CalendarDays className="w-3.5 h-3.5" />
        Histórico de preenchimento — últimos {dias.length} dias
      </p>
      <div className="flex gap-1.5 flex-wrap">
        {[...dias].reverse().map(d => {
          const info = porDia[d]
          const isToday = d === todayStr
          const isPast  = d < todayStr
          const cls = complianceCls(info, isToday, isPast)
          const completo = info && info.preenchidos > 0 && info.preenchidos === info.total
          const parcial  = info && info.preenchidos > 0 && info.preenchidos < info.total
          const faltou   = isPast && (!info || info.preenchidos === 0)

          return (
            <button key={d} onClick={() => onSelectDia(d)}
              title={`${d} — ${info ? `${info.preenchidos}/${info.total} tanques` : 'sem dados'}`}
              className={cn(
                'flex flex-col items-center px-2 py-1.5 rounded-lg border transition-all hover:scale-105',
                cls,
                isToday ? 'ring-2 ring-orange-400 ring-offset-1' : '',
                'border-transparent'
              )}>
              <span className="text-[9px] font-semibold uppercase">{fmtDiaSemana(d)}</span>
              <span className="text-[13px] font-bold leading-none my-0.5">{fmtDiaMes(d)}</span>
              <span className="text-[9px]">{fmtMes(d)}</span>
              <div className="mt-1">
                {completo ? <CheckCircle2 className="w-3 h-3" /> :
                 parcial  ? <span className="text-[9px] font-bold">{info.preenchidos}/{info.total}</span> :
                 faltou   ? <XCircle className="w-3 h-3" /> :
                 isToday  ? <Clock className="w-3 h-3" /> :
                            <span className="text-[9px]">—</span>}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Heat-map compliance (admin/transpombal) ────────────────────────────────────

function HeatMapHistorico({
  historico, todayStr, onGoToDay,
}: {
  historico: HistoricoData
  todayStr: string
  onGoToDay: (posto: string, dia: string) => void
}) {
  const { dias, porPosto } = historico
  const postos = Object.keys(porPosto).sort()
  const diasVisiveis = dias.slice(0, 14)

  // KPIs de compliance de hoje
  const totalPostos    = postos.length
  const preenchidosHoje = postos.filter(p => {
    const info = porPosto[p]?.[todayStr]
    return info && info.preenchidos > 0
  }).length
  const completosHoje = postos.filter(p => {
    const info = porPosto[p]?.[todayStr]
    return info && info.preenchidos === info.total && info.total > 0
  }).length
  const atrasados = postos.filter(p => {
    const ontem = dias[1]
    const info  = porPosto[p]?.[ontem]
    return !info || info.preenchidos === 0
  }).length

  return (
    <div className="space-y-4">
      {/* KPIs de compliance */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <p className="text-2xl font-bold text-emerald-700">{completosHoje}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">Completos hoje</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-2xl font-bold text-amber-600">{preenchidosHoje - completosHoje}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">Parciais hoje</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-2xl font-bold text-red-600">{totalPostos - preenchidosHoje}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">Sem medição hoje</p>
        </div>
        <div className={cn('rounded-xl px-4 py-3 border', atrasados > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200')}>
          <p className={cn('text-2xl font-bold', atrasados > 0 ? 'text-red-600' : 'text-gray-400')}>{atrasados}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">Sem medição ontem</p>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 flex-wrap text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-200 inline-block" />Completo</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-200 inline-block" />Parcial</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-200 inline-block" />Faltou</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-300 inline-block" />Hoje (aguardando)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-100 inline-block" />—</span>
      </div>

      {/* Tabela heat-map */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2.5 font-semibold text-gray-600 whitespace-nowrap sticky left-0 bg-gray-50 z-10 min-w-[140px]">
                  Posto
                </th>
                <th className="px-3 py-2.5 font-semibold text-gray-500 text-center border-l border-gray-200 whitespace-nowrap">
                  Compliance
                </th>
                {[...diasVisiveis].reverse().map(d => (
                  <th key={d} className={cn(
                    'px-2 py-1.5 text-center border-l border-gray-100 whitespace-nowrap',
                    d === todayStr ? 'bg-orange-50' : ''
                  )}>
                    <div className="flex flex-col items-center">
                      <span className={cn('text-[9px] uppercase font-semibold', d === todayStr ? 'text-orange-500' : 'text-gray-400')}>
                        {fmtDiaSemana(d)}
                      </span>
                      <span className={cn('text-[12px] font-bold', d === todayStr ? 'text-orange-600' : 'text-gray-600')}>
                        {fmtDiaMes(d)}
                      </span>
                      <span className="text-[9px] text-gray-400">{fmtMes(d)}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {postos.map((posto, i) => {
                const porDia = porPosto[posto] ?? {}
                const pct    = compliancePct(porDia, diasVisiveis, todayStr)

                return (
                  <tr key={posto} className={cn('border-b border-gray-100 last:border-0', i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30')}>
                    <td className={cn('px-4 py-2 sticky left-0 z-10', i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30')}>
                      <span className="font-semibold text-gray-800 text-[12px] whitespace-nowrap">{posto}</span>
                    </td>
                    <td className="px-3 py-2 text-center border-l border-gray-200">
                      {pct !== null ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={cn('text-[12px] font-bold',
                            pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-500'
                          )}>{pct}%</span>
                          <div className="w-12 h-1 rounded-full bg-gray-200 overflow-hidden">
                            <div className={cn('h-full rounded-full',
                              pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-500'
                            )} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    {[...diasVisiveis].reverse().map(d => {
                      const info    = porDia[d]
                      const isToday = d === todayStr
                      const isPast  = d < todayStr
                      const cls     = complianceCls(info, isToday, isPast)

                      return (
                        <td key={d} className={cn('px-2 py-2 text-center border-l border-gray-100', isToday ? 'bg-orange-50/50' : '')}>
                          <button
                            onClick={() => onGoToDay(posto, d)}
                            title={`${posto} — ${d}: ${info ? `${info.preenchidos}/${info.total}` : 'sem dados'}`}
                            className={cn('w-8 h-8 rounded-lg text-[10px] font-bold flex flex-col items-center justify-center mx-auto gap-0 transition-all hover:scale-110 hover:shadow-sm', cls)}>
                            {info && info.preenchidos > 0
                              ? (info.preenchidos === info.total
                                  ? <CheckCircle2 className="w-4 h-4" />
                                  : <span>{info.preenchidos}/{info.total}</span>)
                              : isPast
                                ? <XCircle className="w-3.5 h-3.5" />
                                : isToday
                                  ? <Clock className="w-3.5 h-3.5" />
                                  : <span className="text-[9px]">—</span>}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Página Principal ───────────────────────────────────────────────────────────

export default function TanquesPage() {
  const { usuario } = useAuthContext()
  const role          = usuario?.role as Role | undefined
  const isGerente     = role === 'gerente'
  const isTranspombal = role === 'transpombal'
  const isAdmin       = role === 'master' || role === 'admin' || isTranspombal

  const [data,          setData]          = useState(today())
  const [postoFiltro,   setPostoFiltro]   = useState('')
  const [postoNomes,    setPostoNomes]    = useState<string[]>([])
  const [allTanques,    setAllTanques]    = useState<Tanque[]>([])
  const [porPosto,      setPorPosto]      = useState<Record<string, Tanque[]>>({})
  const [medicoes,      setMedicoes]      = useState<Record<string, string>>({})
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [viewMode,      setViewMode]      = useState<'geral' | 'detalhe' | 'historico'>(isGerente ? 'detalhe' : 'geral')
  const [filtroBaixo,   setFiltroBaixo]   = useState(false)
  const [historico,     setHistorico]     = useState<HistoricoData | null>(null)
  const [loadingHist,   setLoadingHist]   = useState(false)

  const carregar = useCallback(async (d: string) => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/tanques?data=${d}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setPorPosto(json.porPosto ?? {})
      setAllTanques(json.tanques ?? [])
      const nomes = Object.keys(json.porPosto ?? {}).sort()
      setPostoNomes(nomes)
      const med: Record<string, string> = {}
      for (const t of json.tanques ?? []) {
        if (t.medida_litros !== null) med[t.id] = String(t.medida_litros)
      }
      setMedicoes(med)
      if (isGerente && nomes[0]) { setPostoFiltro(nomes[0]) }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao carregar', description: err.message })
    } finally {
      setLoading(false)
    }
  }, [isGerente])

  const carregarHistorico = useCallback(async () => {
    setLoadingHist(true)
    try {
      const res  = await fetch('/api/tanques/historico?dias=14')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setHistorico(json)
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao carregar histórico', description: err.message })
    } finally {
      setLoadingHist(false)
    }
  }, [])

  useEffect(() => { carregar(data) }, [data])

  // Carrega histórico automaticamente junto com os dados principais
  useEffect(() => { carregarHistorico() }, [carregarHistorico])

  async function salvar() {
    if (!postoFiltro) return
    const tanquesAtual = porPosto[postoFiltro] ?? []
    const payload = tanquesAtual.map(t => ({
      tanque_id:     t.id,
      posto_nome:    t.posto_nome,
      medida_litros: medicoes[t.id] !== undefined && medicoes[t.id] !== ''
        ? parseInt(medicoes[t.id], 10) : null,
    }))
    setSaving(true)
    try {
      const res = await fetch('/api/tanques/medicoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, medicoes: payload }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: 'Medições salvas!', description: `${json.saved} tanques registrados.` })
      carregar(data)
      carregarHistorico()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: err.message })
    } finally {
      setSaving(false)
    }
  }

  function goToDay(posto: string, dia: string) {
    setPostoFiltro(posto)
    setData(dia)
    setViewMode('detalhe')
  }

  // ── dados derivados ──────────────────────────────────────────────────────────
  const resumos   = buildResumo(allTanques, medicoes)
  const criticos  = resumos.filter(r => r.pctGeral !== null && r.pctGeral < 20).length
  const atencao   = resumos.filter(r => r.pctGeral !== null && r.pctGeral >= 20 && r.pctGeral < 40).length
  const ok        = resumos.filter(r => r.pctGeral !== null && r.pctGeral >= 40).length
  const semDados  = resumos.filter(r => r.pctGeral === null).length

  const produtosPresentes = PRODUTOS_ORDEM.filter(p => allTanques.some(t => t.produto === p))
  const produtosCols      = produtosPresentes.filter(p => p !== 'E.T')
  if (produtosPresentes.includes('E.T') && !produtosCols.includes('ETANOL')) produtosCols.push('ETANOL')

  const resumosFiltrados = filtroBaixo
    ? resumos.filter(r => r.pctGeral === null || r.pctGeral < 40)
    : resumos

  const tanquesDetalhe = postoFiltro ? (porPosto[postoFiltro] ?? []) : []
  const detCap = tanquesDetalhe.reduce((s, t) => s + t.capacidade_litros, 0)
  const detMed = tanquesDetalhe.reduce((s, t) => s + (parseInt(medicoes[t.id] ?? '') || (t.medida_litros ?? 0)), 0)
  const detPct = detCap > 0 ? Math.round((detMed / detCap) * 100) : 0
  const detSem = tanquesDetalhe.filter(t => !medicoes[t.id] && t.medida_litros === null).length

  const todayStr = today()

  // ── abas de navegação ──────────────────────────────────────────────────────
  const tabs = isGerente
    ? [
        { key: 'detalhe',   label: 'Medição do Dia' },
        { key: 'historico', label: 'Meu Histórico'  },
      ]
    : [
        { key: 'geral',     label: 'Visão Geral'      },
        { key: 'historico', label: 'Controle de Dias' },
      ]

  return (
    <div className="animate-fade-in">
      <Header
        title="Medição de Tanques"
        description={
          viewMode === 'geral'     ? `${resumos.length} postos · ${allTanques.length} tanques` :
          viewMode === 'historico' ? 'Histórico de preenchimento — últimos 14 dias' :
          postoFiltro ? postoFiltro : 'Editar medições'
        }
        actions={
          <div className="flex items-center gap-2">
            <input
              type="date" value={data}
              onChange={e => setData(e.target.value)}
              className="h-8 px-2 text-[12px] border border-gray-200 rounded-lg bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
            <button onClick={() => { carregar(data); carregarHistorico() }} disabled={loading || loadingHist}
              className="h-8 px-3 flex items-center gap-1.5 text-[12px] font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              <RefreshCw className={cn('w-3.5 h-3.5', (loading || loadingHist) && 'animate-spin')} />
            </button>
            {viewMode === 'detalhe' && postoFiltro && (
              <button onClick={salvar} disabled={saving || loading}
                className="h-8 px-4 flex items-center gap-1.5 text-[12px] font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg disabled:opacity-50 transition-colors">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Salvar
              </button>
            )}
          </div>
        }
      />

      <div className="p-3 md:p-6 space-y-4">

        {/* ── Abas de navegação ───────────────────────────────────────────── */}
        <div className="flex gap-1 border-b border-gray-200">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setViewMode(tab.key as any)}
              className={cn('flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors',
                viewMode === tab.key
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}>
              {tab.key === 'historico' && <CalendarDays className="w-3.5 h-3.5" />}
              {tab.label}
              {/* Badge de alerta no histórico */}
              {tab.key === 'historico' && historico && (() => {
                const semHoje = Object.keys(historico.porPosto).filter(p => {
                  const info = historico.porPosto[p]?.[todayStr]
                  return !info || info.preenchidos === 0
                }).length
                return semHoje > 0 ? (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold">{semHoje}</span>
                ) : null
              })()}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 gap-2 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Carregando…</span>
          </div>
        ) : resumos.length === 0 && viewMode !== 'historico' ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800 space-y-1">
            <p className="font-semibold">Nenhum tanque encontrado para o seu posto.</p>
            <p className="text-amber-600 text-[12px]">Execute as migrations 055 e 056 no Supabase e verifique o vínculo do posto.</p>
          </div>

        ) : viewMode === 'historico' ? (
          /* ── Vista Histórico ──────────────────────────────────────────── */
          loadingHist ? (
            <div className="flex items-center justify-center py-24 gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Carregando histórico…</span>
            </div>
          ) : !historico ? null : isGerente ? (
            /* Gerente: tira de dias */
            <TiraDias
              historico={historico}
              postoNome={postoFiltro}
              todayStr={todayStr}
              onSelectDia={d => { setData(d); setViewMode('detalhe') }}
            />
          ) : (
            /* Admin/Transpombal: heat-map */
            <HeatMapHistorico
              historico={historico}
              todayStr={todayStr}
              onGoToDay={goToDay}
            />
          )

        ) : viewMode === 'geral' ? (
          /* ── Vista Geral ──────────────────────────────────────────────── */
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Crítico (< 20%)',  value: criticos, color: 'text-red-600',     bg: 'bg-red-50 border-red-200',         onClick: () => setFiltroBaixo(true)  },
                { label: 'Atenção (20–40%)', value: atencao,  color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200',     onClick: () => setFiltroBaixo(true)  },
                { label: 'Normal (≥ 40%)',   value: ok,       color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', onClick: () => setFiltroBaixo(false) },
                { label: 'Sem medição',      value: semDados, color: 'text-gray-500',    bg: 'bg-gray-50 border-gray-200',       onClick: () => {}                    },
              ].map(k => (
                <button key={k.label} onClick={k.onClick}
                  className={cn('rounded-xl border px-4 py-3 text-left transition-all hover:shadow-sm', k.bg)}>
                  <p className={cn('text-2xl font-bold', k.color)}>{k.value}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{k.label}</p>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => setFiltroBaixo(f => !f)}
                className={cn('flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-semibold border transition-colors',
                  filtroBaixo ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'
                )}>
                <AlertTriangle className="w-3.5 h-3.5" />
                Críticos e Atenção
              </button>
              <span className="text-[12px] text-gray-400 ml-1">{resumosFiltrados.length} postos</span>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600 whitespace-nowrap">Posto</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Band.</th>
                      {produtosCols.map(p => (
                        <th key={p} className={cn('px-2 py-2.5 font-semibold text-center border-l border-gray-100', getProdutoCfg(p).text)}>
                          {getProdutoCfg(p).label}
                        </th>
                      ))}
                      <th className="px-3 py-2.5 font-semibold text-gray-600 text-center border-l border-gray-200 whitespace-nowrap">% Geral</th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {resumosFiltrados.map((r, i) => (
                      <tr key={r.posto_nome}
                        className={cn('border-b border-gray-100 last:border-0 hover:bg-orange-50/40 transition-colors cursor-pointer',
                          i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                        )}
                        onClick={() => { setPostoFiltro(r.posto_nome); setViewMode('detalhe') }}
                      >
                        <td className="px-4 py-2.5">
                          <span className="font-semibold text-gray-800 whitespace-nowrap">{r.posto_nome}</span>
                          {r.semMedicao > 0 && (
                            <span className="ml-2 text-[10px] text-amber-500">({r.semMedicao} sem medição)</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', BANDEIRA_BADGE[r.bandeira] ?? 'bg-gray-100 text-gray-500')}>
                            {r.bandeira === 'SHELL/IPIRANGA' ? 'S/I' : r.bandeira}
                          </span>
                        </td>
                        {produtosCols.map(p => {
                          const info = r.produtos[p] ?? (p === 'ETANOL' ? r.produtos['E.T'] : undefined)
                          return <ProdCell key={p} info={info} />
                        })}
                        <td className={cn('px-3 py-2.5 text-center border-l border-gray-200', r.pctGeral !== null ? pctBg(r.pctGeral) : '')}>
                          <span className={cn('text-[13px]', pctColor(r.pctGeral))}>
                            {r.pctGeral !== null ? `${r.pctGeral}%` : '—'}
                          </span>
                          {r.pctGeral !== null && (
                            <div className="w-12 h-1.5 mx-auto mt-1 rounded-full bg-gray-200 overflow-hidden">
                              <div className={cn('h-full rounded-full', barColor(r.pctGeral))} style={{ width: `${r.pctGeral}%` }} />
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="text-[11px] text-orange-500 font-medium whitespace-nowrap">Ver →</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>

        ) : (
          /* ── Vista Detalhe / Input ────────────────────────────────────── */
          <>
            <div className="flex items-center gap-3 flex-wrap">
              {isAdmin && (
                <button onClick={() => setViewMode('geral')}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Todos os postos
                </button>
              )}
              {isAdmin && postoNomes.length > 1 && (
                <select value={postoFiltro} onChange={e => setPostoFiltro(e.target.value)}
                  className="h-8 px-2 text-[12px] border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-orange-400">
                  {postoNomes.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              )}
            </div>

            {/* Tira de histórico para gerente */}
            {isGerente && historico && (
              <TiraDias
                historico={historico}
                postoNome={postoFiltro}
                todayStr={todayStr}
                onSelectDia={d => setData(d)}
              />
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">Capacidade Total</p>
                <p className="text-xl font-bold text-gray-900 mt-0.5">{fmtL(detCap)} L</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">Estoque Medido</p>
                <p className="text-xl font-bold text-gray-900 mt-0.5">{fmtL(detMed)} L</p>
              </div>
              <div className={cn('rounded-xl border px-4 py-3', pctBg(detPct))}>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">Nível Geral</p>
                <p className={cn('text-xl font-bold mt-0.5', pctColor(detPct))}>{detPct}%</p>
                <div className="mt-1.5 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all', barColor(detPct))} style={{ width: `${detPct}%` }} />
                </div>
              </div>
              <div className={cn('rounded-xl border px-4 py-3', detSem > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200')}>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">Sem Medição</p>
                <p className={cn('text-xl font-bold mt-0.5', detSem > 0 ? 'text-amber-600' : 'text-emerald-600')}>
                  {detSem} tanque{detSem !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {tanquesDetalhe.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">Nenhum tanque cadastrado para este posto.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {tanquesDetalhe.map(tanque => {
                  const cfg      = getProdutoCfg(tanque.produto)
                  const raw      = medicoes[tanque.id]
                  const medVal   = raw !== undefined && raw !== '' ? parseInt(raw, 10) : (tanque.medida_litros ?? 0)
                  const pct      = tanque.capacidade_litros > 0 ? Math.min(100, Math.round((medVal / tanque.capacidade_litros) * 100)) : 0
                  const temValor = (raw !== undefined && raw !== '') || tanque.medida_litros !== null

                  return (
                    <div key={tanque.id} className={cn('rounded-xl border shadow-sm overflow-hidden', cfg.bg, 'border-gray-200')}>
                      <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-2">
                        <div>
                          <div className={cn('inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold', cfg.text, 'bg-white/70')}>
                            <Droplets className="w-3 h-3" />
                            {tanque.produto}
                          </div>
                          <p className="text-[11px] text-gray-500 mt-1">{cfg.label}</p>
                        </div>
                        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', BANDEIRA_BADGE[tanque.bandeira] ?? 'bg-gray-100 text-gray-600')}>
                          {tanque.bandeira === 'SHELL/IPIRANGA' ? 'S/I' : tanque.bandeira}
                        </span>
                      </div>
                      <div className="px-4 pb-2">
                        <p className="text-[11px] text-gray-400">Cap: <span className="font-semibold text-gray-600">{fmtL(tanque.capacidade_litros)} L</span></p>
                      </div>
                      <div className="px-4 pb-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] text-gray-400">Nível</span>
                          <span className={cn('text-[11px]', temValor ? pctColor(pct) : 'text-gray-300 font-normal')}>
                            {temValor ? `${pct}%` : '—'}
                          </span>
                        </div>
                        <div className="h-2 bg-white/60 rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all', temValor ? barColor(pct) : 'bg-gray-200')}
                            style={{ width: temValor ? `${pct}%` : '0%' }} />
                        </div>
                      </div>
                      <div className="px-4 pb-4 pt-1">
                        <label className="text-[11px] font-semibold text-gray-500 block mb-1">Medição (litros)</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number" min={0} max={tanque.capacidade_litros} step={100}
                            value={medicoes[tanque.id] ?? (tanque.medida_litros !== null ? String(tanque.medida_litros) : '')}
                            onChange={e => setMedicoes(prev => ({ ...prev, [tanque.id]: e.target.value }))}
                            placeholder="0"
                            className="flex-1 h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                          />
                          <span className="text-[11px] text-gray-400 shrink-0">L</span>
                        </div>
                        {medVal > tanque.capacidade_litros && (
                          <p className="text-[10px] text-red-500 mt-1">Valor maior que a capacidade</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
