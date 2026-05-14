'use client'

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils/cn'
import {
  TrendingUp, TrendingDown, DollarSign, Percent,
  ChevronDown, ChevronUp, Loader2, AlertTriangle,
  Tag, BarChart2, Search, Layers, X,
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  Cell,
} from 'recharts'
import type { VendaAnaliseProduto, VendaDesconto } from '@/lib/autosystem'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Posto {
  id: string
  nome: string
  codigo_empresa_externo: string | null
}

interface Grupo {
  id: string
  codigo: number
  nome: string
}

interface Kpis {
  venda: number
  custo: number
  lucro: number
  margem: number
}

interface MesData {
  mes: string
  venda: number
  custo: number
  lucro: number
}

interface AnaliseData {
  kpis: Kpis
  porMes: MesData[]
  porProduto: VendaAnaliseProduto[]
  vendasComDesconto: VendaDesconto[]
  temPrecoTabela: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const BAR_COLORS = ['#f97316','#3b82f6','#8b5cf6','#10b981','#ec4899','#14b8a6','#f59e0b','#6366f1','#ef4444','#22c55e']

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtBRL  = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtPct  = (v: number) => `${v.toFixed(1)}%`
const fmtQtd  = (v: number) => v % 1 === 0 ? v.toLocaleString('pt-BR') : v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })

function mesLabel(yyyymm: string) {
  const [y, m] = yyyymm.split('-')
  return `${MESES[parseInt(m) - 1]}/${y?.slice(2)}`
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ title, value, sub, icon: Icon, color, bg }: {
  title: string; value: string; sub?: string
  icon: React.ElementType; color: string; bg: string
}) {
  return (
    <Card className="border-gray-200 shadow-sm">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wide truncate">{title}</p>
            <p className="text-[18px] sm:text-[22px] font-bold text-gray-900 mt-1 leading-none tabular-nums">{value}</p>
            {sub && <p className="text-[10px] sm:text-[11px] text-gray-400 mt-1.5">{sub}</p>}
          </div>
          <div className={cn('w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0', bg)}>
            <Icon className={cn('w-4 h-4 sm:w-5 sm:h-5', color)} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-[12px]">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-semibold text-gray-800">{fmtBRL(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AnaliseVendasPage() {
  const hoje = new Date()
  const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10)
  const hojeStr        = hoje.toISOString().slice(0, 10)

  const [postos,        setPostos]        = useState<Posto[]>([])
  const [postoId,       setPostoId]       = useState<string>('')
  const [dataIni,       setDataIni]       = useState(primeiroDiaMes)
  const [dataFim,       setDataFim]       = useState(hojeStr)
  const [grupos,        setGrupos]        = useState<Grupo[]>([])
  const [grupoIds,      setGrupoIds]      = useState<Set<string>>(new Set())
  const [grupoDropOpen, setGrupoDropOpen] = useState(false)
  const grupoRef = useRef<HTMLDivElement>(null)
  const [produtoSearch, setProdutoSearch] = useState('')
  const [data,          setData]          = useState<AnaliseData | null>(null)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [showDesconto,  setShowDesconto]  = useState(false)
  const [sortProduto,   setSortProduto]   = useState<{ col: keyof VendaAnaliseProduto; dir: 'asc'|'desc' }>({ col: 'venda', dir: 'desc' })
  const [resultLabel,   setResultLabel]   = useState<{ posto: string; periodo: string; grupos: string } | null>(null)

  // Carrega postos
  useEffect(() => {
    const sb = createClient()
    sb.from('postos').select('id, nome, codigo_empresa_externo').order('nome')
      .then(({ data }) => {
        const list = (data ?? []) as Posto[]
        setPostos(list)
        if (list.length) setPostoId(list[0].id)
      })
  }, [])

  // Carrega grupos de produto do AutoSystem
  useEffect(() => {
    fetch('/api/autosystem/grupos-produto')
      .then(r => r.json())
      .then((list: Grupo[]) => setGrupos(list))
      .catch(() => {})
  }, [])

  // Fecha dropdown de grupo ao clicar fora
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (grupoRef.current && !grupoRef.current.contains(e.target as Node)) {
        setGrupoDropOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const posto = postos.find(p => p.id === postoId)

  const fetchData = useCallback(async () => {
    if (!posto?.codigo_empresa_externo) {
      setError('Este posto não possui código de empresa no AutoSystem configurado.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        empresaIds: posto.codigo_empresa_externo,
        dataIni,
        dataFim,
      })
      if (grupoIds.size > 0) params.set('grupoIds', [...grupoIds].join(','))

      const res  = await fetch(`/api/analise-vendas?${params}`)
      if (!res.ok) throw new Error('Erro ao carregar dados')
      const json = await res.json()
      setData(json as AnaliseData)
      setShowDesconto(false)

      const fmtData = (s: string) => {
        const [y, m, d] = s.split('-')
        return `${d}/${m}/${y}`
      }
      const gruposLabel = grupoIds.size === 0
        ? 'Todos os grupos'
        : [...grupoIds].map(id => grupos.find(g => g.id === id)?.nome ?? id).join(', ')

      setResultLabel({
        posto:   posto.nome,
        periodo: `${fmtData(dataIni)} — ${fmtData(dataFim)}`,
        grupos:  gruposLabel,
      })
    } catch (e: any) {
      setError(e.message ?? 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [posto, dataIni, dataFim, grupoIds, grupos])

  // Sorted + filtered products table
  const produtosSorted = useMemo(() => {
    if (!data?.porProduto) return []
    const sorted = [...data.porProduto].sort((a, b) => {
      const va = a[sortProduto.col] as number ?? 0
      const vb = b[sortProduto.col] as number ?? 0
      return sortProduto.dir === 'asc' ? va - vb : vb - va
    })
    if (!produtoSearch.trim()) return sorted
    const q = produtoSearch.toLowerCase()
    return sorted.filter(p => p.produto_nome.toLowerCase().includes(q))
  }, [data, sortProduto, produtoSearch])

  function toggleSort(col: keyof VendaAnaliseProduto) {
    setSortProduto(prev =>
      prev.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: 'desc' }
    )
  }

  // Top 10 for bar chart
  const top10 = useMemo(() =>
    (data?.porProduto ?? [])
      .slice(0, 10)
      .map(p => ({ nome: p.produto_nome.length > 20 ? p.produto_nome.slice(0, 18) + '…' : p.produto_nome, venda: p.venda, custo: p.custo })),
    [data]
  )

  // Month evolution chart data
  const porMesChart = useMemo(() =>
    (data?.porMes ?? []).map(m => ({
      ...m,
      label: mesLabel(m.mes),
    })),
    [data]
  )

  return (
    <div className="flex flex-col h-full">
      <Header title="Análise de Vendas" />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">

        {/* ── Filtros ── */}
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-3">

              {/* Posto */}
              <div className="flex flex-col gap-1 min-w-[160px] flex-1">
                <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Posto</label>
                <select value={postoId} onChange={e => setPostoId(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-gray-200 text-[13px] bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30">
                  {postos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>

              {/* De */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">De</label>
                <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-gray-200 text-[13px] bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30" />
              </div>

              {/* Até */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Até</label>
                <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-gray-200 text-[13px] bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30" />
              </div>

              {/* Grupo */}
              <div className="flex flex-col gap-1 relative" ref={grupoRef}>
                <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Grupo de Produto</label>
                <button
                  onClick={() => setGrupoDropOpen(v => !v)}
                  className="h-9 px-3 min-w-[170px] rounded-lg border border-gray-200 text-[13px] bg-white shadow-sm text-left flex items-center justify-between gap-2 focus:outline-none"
                >
                  <span className="flex items-center gap-1.5 truncate text-gray-700">
                    <Layers className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    {grupoIds.size === 0 ? 'Todos os grupos' : `${grupoIds.size} grupo${grupoIds.size > 1 ? 's' : ''}`}
                  </span>
                  <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform', grupoDropOpen && 'rotate-180')} />
                </button>
                {grupoDropOpen && (
                  <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-2 min-w-[220px] max-h-60 overflow-y-auto">
                    <button
                      onClick={() => { setGrupoIds(new Set()); setGrupoDropOpen(false) }}
                      className={cn('w-full text-left px-3 py-1.5 rounded-lg text-[12.5px] hover:bg-orange-50 transition-colors', grupoIds.size === 0 && 'bg-orange-50 text-orange-600 font-medium')}
                    >
                      Todos os grupos
                    </button>
                    {grupos.map(g => (
                      <label key={g.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={grupoIds.has(g.id)}
                          onChange={e => setGrupoIds(prev => {
                            const next = new Set(prev)
                            if (e.target.checked) next.add(g.id); else next.delete(g.id)
                            return next
                          })}
                          className="accent-orange-500 w-3.5 h-3.5"
                        />
                        <span className="text-[12.5px] text-gray-700 truncate">{g.nome}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Produto */}
              <div className="flex flex-col gap-1 min-w-[150px] flex-1">
                <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Produto</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <input type="text" placeholder="Filtrar produto..." value={produtoSearch}
                    onChange={e => setProdutoSearch(e.target.value)}
                    className="h-9 pl-8 pr-3 w-full rounded-lg border border-gray-200 text-[13px] bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30" />
                  {produtoSearch && (
                    <button onClick={() => setProdutoSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Buscar */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-transparent uppercase tracking-wide select-none">.</label>
                <button
                  onClick={fetchData}
                  disabled={loading || !postoId}
                  className="h-9 px-5 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[13px] font-semibold transition-colors flex items-center gap-2 shadow-sm"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BarChart2 className="w-3.5 h-3.5" />}
                  Buscar
                </button>
              </div>

            </div>
          </CardContent>
        </Card>

        {/* ── Estado ── */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
            <span className="ml-2 text-[13px] text-gray-400">Carregando dados do AutoSystem...</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-600">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {!loading && !data && !error && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center mb-3">
              <BarChart2 className="w-6 h-6 text-orange-300" />
            </div>
            <p className="text-[13px] font-medium text-gray-500">Selecione um posto e o período</p>
            <p className="text-[12px] text-gray-400 mt-0.5">Depois clique em <strong>Buscar</strong> para carregar a análise</p>
          </div>
        )}

        {!loading && !error && data && resultLabel && (
          <>
            {/* ── Banner do resultado ── */}
            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-xl text-[12.5px]">
              <div className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" />
              <span className="text-orange-700 font-medium">{resultLabel.posto}</span>
              <span className="text-orange-400">·</span>
              <span className="text-orange-600">{resultLabel.periodo}</span>
              <span className="text-orange-400">·</span>
              <span className="text-orange-600 truncate max-w-xs">{resultLabel.grupos}</span>
            </div>

            {/* ── KPIs ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard title="Faturamento"  value={fmtBRL(data.kpis.venda)}  icon={DollarSign}   color="text-blue-600"   bg="bg-blue-50" />
              <KpiCard title="Custo Total"  value={fmtBRL(data.kpis.custo)}  icon={TrendingDown} color="text-red-500"    bg="bg-red-50"  />
              <KpiCard title="Lucro Bruto"  value={fmtBRL(data.kpis.lucro)}  icon={TrendingUp}   color="text-green-600" bg="bg-green-50"
                sub={data.kpis.lucro >= 0 ? 'Resultado positivo' : 'Resultado negativo'} />
              <KpiCard title="Margem Bruta" value={fmtPct(data.kpis.margem)} icon={Percent}      color="text-orange-500" bg="bg-orange-50"
                sub={`sobre R$ ${(data.kpis.venda / 1000).toFixed(0)}k faturado`} />
            </div>

            {/* ── Gráficos ── */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

              {/* Evolução Mensal */}
              <Card className="border-gray-200 shadow-sm">
                <CardContent className="p-4 sm:p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-4">Evolução Mensal</p>
                  {porMesChart.length === 0 ? (
                    <div className="flex items-center justify-center h-48 text-[13px] text-gray-400">Sem dados no período</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={porMesChart} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="venda"  name="Venda"  fill="#3b82f6" radius={[3,3,0,0]} />
                        <Bar dataKey="custo"  name="Custo"  fill="#ef4444" radius={[3,3,0,0]} />
                        <Bar dataKey="lucro"  name="Lucro"  fill="#10b981" radius={[3,3,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Top 10 Produtos */}
              <Card className="border-gray-200 shadow-sm">
                <CardContent className="p-4 sm:p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-4">Top 10 Produtos — Faturamento</p>
                  {top10.length === 0 ? (
                    <div className="flex items-center justify-center h-48 text-[13px] text-gray-400">Sem dados no período</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={top10} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                        <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} width={110} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="venda" name="Venda" radius={[0,3,3,0]}>
                          {top10.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ── Tabela de Precificação ── */}
            <Card className="border-gray-200 shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Tag className="w-4 h-4 text-orange-500" />
                  <p className="text-[13px] font-semibold text-gray-700">Precificação por Produto</p>
                </div>

                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/60">
                        {([
                          { key: 'produto_nome',   label: 'Produto',         cls: 'text-left',                          sort: true  },
                          { key: 'qtd',            label: 'Qtd',             cls: 'text-right',                         sort: true  },
                          { key: 'venda',          label: 'Faturamento',     cls: 'text-right',                         sort: true  },
                          { key: 'custo',          label: 'Custo Total',     cls: 'text-right hidden sm:table-cell',    sort: true  },
                          { key: null,             label: 'Lucro',           cls: 'text-right hidden sm:table-cell',    sort: false },
                          { key: null,             label: 'Margem',          cls: 'text-right',                         sort: false },
                          { key: 'custo_unitario', label: 'Custo Unit.',     cls: 'text-right hidden md:table-cell',    sort: true  },
                          { key: 'preco_medio',    label: 'Preço Praticado', cls: 'text-right hidden md:table-cell',    sort: true  },
                          { key: 'preco_tabela',   label: 'Preço Hoje',     cls: 'text-right hidden lg:table-cell',    sort: true  },
                          { key: null,             label: 'Desvio',          cls: 'text-right hidden lg:table-cell',    sort: false },
                          { key: 'total_desconto', label: 'Desc. Total',     cls: 'text-right hidden xl:table-cell',    sort: true  },
                        ] as { key: keyof VendaAnaliseProduto | null; label: string; cls: string; sort: boolean }[]).map(({ key, label, cls, sort }) => (
                          <th key={label}
                            className={cn('px-3 py-2.5 font-medium text-gray-500 whitespace-nowrap', cls,
                              sort && key ? 'cursor-pointer select-none hover:text-gray-800' : '')}
                            onClick={() => sort && key ? toggleSort(key) : undefined}
                          >
                            <span className="inline-flex items-center gap-1">
                              {label}
                              {sort && key && sortProduto.col === key && (
                                sortProduto.dir === 'asc'
                                  ? <ChevronUp className="w-3 h-3 text-orange-500" />
                                  : <ChevronDown className="w-3 h-3 text-orange-500" />
                              )}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {produtosSorted.length === 0 ? (
                        <tr><td colSpan={11} className="text-center py-10 text-[13px] text-gray-400">Sem dados no período</td></tr>
                      ) : produtosSorted.map(p => {
                        const lucro  = p.venda - p.custo
                        const margem = p.venda > 0 ? (lucro / p.venda) * 100 : 0
                        const desvio = p.preco_tabela && p.preco_tabela > 0
                          ? ((p.preco_medio - p.preco_tabela) / p.preco_tabela) * 100
                          : null
                        const margemColor = margem >= 20 ? 'text-green-600' : margem >= 10 ? 'text-yellow-600' : 'text-red-500'
                        const desvioColor = desvio == null ? '' : desvio >= -0.5 ? 'text-green-600' : desvio >= -5 ? 'text-yellow-600' : 'text-red-500'
                        return (
                          <tr key={p.produto} className="hover:bg-orange-50/30 transition-colors">
                            <td className="px-3 py-2 text-gray-800 font-medium max-w-[200px] truncate">{p.produto_nome}</td>
                            <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{fmtQtd(p.qtd)}</td>
                            <td className="px-3 py-2 text-right text-gray-800 tabular-nums font-medium">{fmtBRL(p.venda)}</td>
                            <td className="px-3 py-2 text-right text-gray-600 tabular-nums hidden sm:table-cell">{fmtBRL(p.custo)}</td>
                            <td className={cn('px-3 py-2 text-right tabular-nums font-medium hidden sm:table-cell', lucro >= 0 ? 'text-green-600' : 'text-red-500')}>{fmtBRL(lucro)}</td>
                            <td className={cn('px-3 py-2 text-right tabular-nums font-semibold', margemColor)}>{fmtPct(margem)}</td>
                            <td className="px-3 py-2 text-right text-gray-600 tabular-nums hidden md:table-cell">{p.custo_unitario > 0 ? fmtBRL(p.custo_unitario) : '—'}</td>
                            <td className="px-3 py-2 text-right text-gray-600 tabular-nums hidden md:table-cell">{fmtBRL(p.preco_medio)}</td>
                            <td className="px-3 py-2 text-right text-gray-600 tabular-nums hidden lg:table-cell">{p.preco_tabela ? fmtBRL(p.preco_tabela) : '—'}</td>
                            <td className={cn('px-3 py-2 text-right tabular-nums font-medium hidden lg:table-cell', desvioColor)}>
                              {desvio != null ? `${desvio >= 0 ? '+' : ''}${desvio.toFixed(1)}%` : '—'}
                            </td>
                            <td className={cn('px-3 py-2 text-right tabular-nums hidden xl:table-cell', p.total_desconto > 0 ? 'text-red-500 font-medium' : 'text-gray-400')}>
                              {p.total_desconto > 0 ? `-${fmtBRL(p.total_desconto)}` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* ── Vendas com Desconto ── */}
            <Card className="border-gray-200 shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <button
                  onClick={() => setShowDesconto(v => !v)}
                  className="w-full flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                      <BarChart2 className="w-4 h-4 text-red-500" />
                    </div>
                    <div className="text-left">
                      <p className="text-[13px] font-semibold text-gray-700">Vendas com Desconto</p>
                      <p className="text-[11px] text-gray-400">
                        {data.vendasComDesconto.length} venda{data.vendasComDesconto.length !== 1 ? 's' : ''} com desconto aplicado no período
                      </p>
                    </div>
                  </div>
                  {showDesconto
                    ? <ChevronUp className="w-4 h-4 text-gray-400" />
                    : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </button>

                  {showDesconto && (
                    <div className="mt-4 overflow-x-auto scrollbar-thin">
                      {data.vendasComDesconto.length === 0 ? (
                        <div className="flex items-center justify-center py-8 text-[13px] text-gray-400">
                          Nenhuma venda com desconto encontrada no período
                        </div>
                      ) : (
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/60">
                              <th className="px-3 py-2.5 text-left font-medium text-gray-500">Produto</th>
                              <th className="px-3 py-2.5 text-left font-medium text-gray-500 hidden sm:table-cell">Data</th>
                              <th className="px-3 py-2.5 text-right font-medium text-gray-500">Qtd</th>
                              <th className="px-3 py-2.5 text-right font-medium text-gray-500 hidden sm:table-cell">Preço Hoje</th>
                              <th className="px-3 py-2.5 text-right font-medium text-gray-500">Praticado</th>
                              <th className="px-3 py-2.5 text-right font-medium text-gray-500">Desc R$</th>
                              <th className="px-3 py-2.5 text-right font-medium text-gray-500">Desc %</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {data.vendasComDesconto.map((v, i) => (
                              <tr key={i} className="hover:bg-red-50/30 transition-colors">
                                <td className="px-3 py-2 text-gray-800 max-w-[160px] truncate">{v.produto_nome}</td>
                                <td className="px-3 py-2 text-gray-500 hidden sm:table-cell whitespace-nowrap">
                                  {new Date(v.data + 'T00:00:00').toLocaleDateString('pt-BR')}
                                </td>
                                <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{fmtQtd(v.quantidade)}</td>
                                <td className="px-3 py-2 text-right text-gray-600 tabular-nums hidden sm:table-cell">{fmtBRL(v.preco_tabela)}</td>
                                <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{fmtBRL(v.preco_unit)}</td>
                                <td className="px-3 py-2 text-right text-red-500 tabular-nums font-medium">-{fmtBRL(v.desconto_unit * v.quantidade)}</td>
                                <td className={cn('px-3 py-2 text-right tabular-nums font-semibold',
                                  v.desconto_perc < 2 ? 'text-yellow-600' : v.desconto_perc < 5 ? 'text-orange-500' : 'text-red-600')}>
                                  -{v.desconto_perc.toFixed(1)}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-gray-200 bg-gray-50">
                              <td colSpan={5} className="px-3 py-2 text-[11px] font-semibold text-gray-500 hidden sm:table-cell">Total perdido em descontos</td>
                              <td colSpan={5} className="px-3 py-2 text-[11px] font-semibold text-gray-500 sm:hidden">Total perdido</td>
                              <td className="px-3 py-2 text-right text-[12px] font-bold text-red-600 tabular-nums">
                                -{fmtBRL(data.vendasComDesconto.reduce((s, v) => s + v.desconto_unit * v.quantidade, 0))}
                              </td>
                              <td className="px-3 py-2 text-right text-[12px] font-semibold text-red-500 tabular-nums">
                                -{fmtPct(
                                  data.vendasComDesconto.length > 0
                                    ? data.vendasComDesconto.reduce((s, v) => s + v.desconto_perc, 0) / data.vendasComDesconto.length
                                    : 0
                                )} med.
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

          </>
        )}


      </div>
    </div>
  )
}
