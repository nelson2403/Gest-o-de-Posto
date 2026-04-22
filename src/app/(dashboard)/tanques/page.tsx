'use client'

import { useCallback, useEffect, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { toast } from '@/hooks/use-toast'
import { useAuthContext } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils/cn'
import { Loader2, Save, RefreshCw, Droplets, ArrowLeft, AlertTriangle, LayoutGrid, TableProperties } from 'lucide-react'
import type { Role } from '@/types/database.types'

interface Tanque {
  id: string
  posto_nome: string
  bandeira: string
  produto: string
  capacidade_litros: number
  ordem: number
  medida_litros: number | null
}

// Produtos canônicos para colunas da tabela geral
const PRODUTOS_ORDEM = ['G.C','G.A','ETANOL','E.T','D.C','D.S-10','G.R']

const PRODUTO_CONFIG: Record<string, { label: string; bg: string; text: string; cell: string }> = {
  'G.C':    { label: 'G.C',    bg: 'bg-yellow-50',  text: 'text-yellow-800', cell: 'bg-yellow-400' },
  'G.A':    { label: 'G.A',    bg: 'bg-amber-50',   text: 'text-amber-800',  cell: 'bg-amber-400'  },
  'ETANOL': { label: 'ETANOL', bg: 'bg-green-50',   text: 'text-green-800',  cell: 'bg-green-500'  },
  'E.T':    { label: 'E.T',    bg: 'bg-green-50',   text: 'text-green-800',  cell: 'bg-green-500'  },
  'D.C':    { label: 'D.C',    bg: 'bg-blue-50',    text: 'text-blue-800',   cell: 'bg-blue-500'   },
  'D.S-10': { label: 'D.S10',  bg: 'bg-sky-50',     text: 'text-sky-800',    cell: 'bg-sky-500'    },
  'D.S10':  { label: 'D.S10',  bg: 'bg-sky-50',     text: 'text-sky-800',    cell: 'bg-sky-500'    },
  'G.R':    { label: 'G.R',    bg: 'bg-red-50',     text: 'text-red-800',    cell: 'bg-red-400'    },
}

const BANDEIRA_BADGE: Record<string, string> = {
  'BR':             'bg-blue-100 text-blue-700',
  'SHELL':          'bg-yellow-100 text-yellow-700',
  'SHELL/IPIRANGA': 'bg-orange-100 text-orange-700',
}

function getProdutoCfg(p: string) {
  return PRODUTO_CONFIG[p] ?? { label: p, bg: 'bg-gray-50', text: 'text-gray-700', cell: 'bg-gray-400' }
}
function fmtL(n: number) { return n.toLocaleString('pt-BR') }
function today() { return new Date().toISOString().slice(0, 10) }

function pctColor(pct: number | null) {
  if (pct === null) return 'text-gray-300'
  if (pct < 20)  return 'text-red-600 font-bold'
  if (pct < 40)  return 'text-amber-600 font-semibold'
  return 'text-emerald-600 font-semibold'
}
function pctBg(pct: number | null) {
  if (pct === null) return 'bg-gray-100'
  if (pct < 20)  return 'bg-red-50 border-red-200'
  if (pct < 40)  return 'bg-amber-50 border-amber-200'
  return 'bg-emerald-50 border-emerald-200'
}
function barColor(pct: number) {
  if (pct < 20) return 'bg-red-500'
  if (pct < 40) return 'bg-amber-400'
  return 'bg-emerald-500'
}

// Resumo de um posto: produto → { pct, litros, capacidade }
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
      map[t.posto_nome] = { posto_nome: t.posto_nome, bandeira: t.bandeira, produtos: {}, pctGeral: null, semMedicao: 0, totalCap: 0, totalMed: 0 }
    }
    const raw = medicoes[t.id]
    const medida = raw !== undefined && raw !== '' ? parseInt(raw, 10) : t.medida_litros
    const pct = medida !== null && t.capacidade_litros > 0
      ? Math.min(100, Math.round((medida / t.capacidade_litros) * 100))
      : null
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

// ── Mini célula de produto na tabela geral ──────────────────────────────────
function ProdCell({ info }: { info: { pct: number | null; medida: number | null; capacidade: number } | undefined }) {
  if (!info) return <td className="px-2 py-2 text-center text-gray-200 text-[11px]">—</td>
  const { pct, medida, capacidade } = info
  return (
    <td className={cn('px-2 py-2 text-center border-l border-gray-100', pct !== null ? pctBg(pct) : '')}>
      <div className="flex flex-col items-center gap-0.5">
        <span className={cn('text-[11px]', pctColor(pct))}>{pct !== null ? `${pct}%` : '—'}</span>
        {pct !== null && (
          <div className="w-10 h-1 rounded-full bg-gray-200 overflow-hidden">
            <div className={cn('h-full rounded-full', barColor(pct))} style={{ width: `${pct}%` }} />
          </div>
        )}
        {medida !== null && (
          <span className="text-[9px] text-gray-400">{fmtL(medida ?? 0)}L</span>
        )}
      </div>
    </td>
  )
}

export default function TanquesPage() {
  const { usuario } = useAuthContext()
  const role        = usuario?.role as Role | undefined
  const isGerente     = role === 'gerente'
  const isTranspombal = role === 'transpombal'
  const isAdmin       = role === 'master' || role === 'admin' || isTranspombal

  const [data,        setData]        = useState(today())
  const [postoFiltro, setPostoFiltro] = useState('')
  const [postoNomes,  setPostoNomes]  = useState<string[]>([])
  const [allTanques,  setAllTanques]  = useState<Tanque[]>([])
  const [porPosto,    setPorPosto]    = useState<Record<string, Tanque[]>>({})
  const [medicoes,    setMedicoes]    = useState<Record<string, string>>({})
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [viewMode,    setViewMode]    = useState<'geral' | 'detalhe'>('geral')
  const [filtroBaixo, setFiltroBaixo] = useState(false)

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
      if (isGerente && nomes[0]) { setPostoFiltro(nomes[0]); setViewMode('detalhe') }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao carregar', description: err.message })
    } finally {
      setLoading(false)
    }
  }, [isGerente])

  useEffect(() => { carregar(data) }, [data])

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
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: err.message })
    } finally {
      setSaving(false)
    }
  }

  // ── dados derivados ────────────────────────────────────────────────────────
  const resumos    = buildResumo(allTanques, medicoes)
  const criticos   = resumos.filter(r => r.pctGeral !== null && r.pctGeral < 20).length
  const atencao    = resumos.filter(r => r.pctGeral !== null && r.pctGeral >= 20 && r.pctGeral < 40).length
  const ok         = resumos.filter(r => r.pctGeral !== null && r.pctGeral >= 40).length
  const semDados   = resumos.filter(r => r.pctGeral === null).length

  // Produtos que existem nos dados (para colunas)
  const produtosPresentes = PRODUTOS_ORDEM.filter(p =>
    allTanques.some(t => t.produto === p)
  )
  // Normaliza ETANOL/E.T como uma coluna só
  const produtosCols = produtosPresentes.filter(p => p !== 'E.T')
  if (produtosPresentes.includes('E.T') && !produtosCols.includes('ETANOL')) produtosCols.push('ETANOL')

  const resumosFiltrados = filtroBaixo
    ? resumos.filter(r => r.pctGeral === null || r.pctGeral < 40)
    : resumos

  const tanquesDetalhe = postoFiltro ? (porPosto[postoFiltro] ?? []) : []

  // KPIs do detalhe
  const detCap  = tanquesDetalhe.reduce((s, t) => s + t.capacidade_litros, 0)
  const detMed  = tanquesDetalhe.reduce((s, t) => s + (parseInt(medicoes[t.id] ?? '') || (t.medida_litros ?? 0)), 0)
  const detPct  = detCap > 0 ? Math.round((detMed / detCap) * 100) : 0
  const detSem  = tanquesDetalhe.filter(t => !medicoes[t.id] && t.medida_litros === null).length

  return (
    <div className="animate-fade-in">
      <Header
        title={viewMode === 'detalhe' && postoFiltro ? postoFiltro : 'Medição de Tanques'}
        description={viewMode === 'geral' ? `${resumos.length} postos · ${allTanques.length} tanques` : 'Editar medições do posto'}
        actions={
          <div className="flex items-center gap-2">
            <input
              type="date" value={data}
              onChange={e => setData(e.target.value)}
              className="h-8 px-2 text-[12px] border border-gray-200 rounded-lg bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
            <button onClick={() => carregar(data)} disabled={loading}
              className="h-8 px-3 flex items-center gap-1.5 text-[12px] font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
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
        {loading ? (
          <div className="flex items-center justify-center py-24 gap-2 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Carregando tanques…</span>
          </div>
        ) : resumos.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800 space-y-1">
            <p className="font-semibold">Nenhum tanque encontrado para o seu posto.</p>
            <p className="text-amber-600 text-[12px]">Execute as migrations 055 e 056 no Supabase e verifique o vínculo do posto.</p>
          </div>
        ) : viewMode === 'geral' ? (
          <>
            {/* ── KPIs gerais ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Crítico (< 20%)',   value: criticos, color: 'text-red-600',     bg: 'bg-red-50 border-red-200',       onClick: () => setFiltroBaixo(true) },
                { label: 'Atenção (20–40%)',  value: atencao,  color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200',   onClick: () => setFiltroBaixo(true) },
                { label: 'Normal (≥ 40%)',    value: ok,       color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', onClick: () => setFiltroBaixo(false) },
                { label: 'Sem medição',       value: semDados, color: 'text-gray-500',    bg: 'bg-gray-50 border-gray-200',     onClick: () => {} },
              ].map(k => (
                <button key={k.label} onClick={k.onClick}
                  className={cn('rounded-xl border px-4 py-3 text-left transition-all hover:shadow-sm', k.bg)}>
                  <p className={cn('text-2xl font-bold', k.color)}>{k.value}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{k.label}</p>
                </button>
              ))}
            </div>

            {/* ── Barra de controles ──────────────────────────────────────── */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setFiltroBaixo(f => !f)}
                className={cn('flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-semibold border transition-colors',
                  filtroBaixo ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'
                )}>
                <AlertTriangle className="w-3.5 h-3.5" />
                Críticos e Atenção
              </button>
              <span className="text-[12px] text-gray-400 ml-1">{resumosFiltrados.length} postos</span>
            </div>

            {/* ── Tabela geral ─────────────────────────────────────────────── */}
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
                      <th className="px-3 py-2.5"></th>
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
                          // ETANOL pode estar salvo como E.T
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
            {/* Botão voltar + KPIs do posto */}
            <div className="flex items-center gap-3 flex-wrap">
              {isAdmin && (
                <button onClick={() => setViewMode('geral')}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Todos os postos
                </button>
              )}

              {/* Seletor de posto (admin) */}
              {isAdmin && postoNomes.length > 1 && (
                <select
                  value={postoFiltro}
                  onChange={e => setPostoFiltro(e.target.value)}
                  className="h-8 px-2 text-[12px] border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-orange-400"
                >
                  {postoNomes.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              )}
            </div>

            {/* KPI cards do posto */}
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

            {/* Cards de input por tanque */}
            {tanquesDetalhe.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">Nenhum tanque cadastrado para este posto.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {tanquesDetalhe.map(tanque => {
                  const cfg    = getProdutoCfg(tanque.produto)
                  const raw    = medicoes[tanque.id]
                  const medVal = raw !== undefined && raw !== '' ? parseInt(raw, 10) : (tanque.medida_litros ?? 0)
                  const pct    = tanque.capacidade_litros > 0 ? Math.min(100, Math.round((medVal / tanque.capacidade_litros) * 100)) : 0
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
