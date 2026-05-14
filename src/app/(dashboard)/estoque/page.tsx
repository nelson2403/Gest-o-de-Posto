'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils/cn'
import { formatCurrency } from '@/lib/utils/formatters'
import {
  RefreshCw, Fuel, Wrench, ShoppingBag,
  ChevronDown, Package, Layers, AlertTriangle,
  TrendingUp,
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PostoOpt { id: string; nome: string; codigo_empresa_externo: string | null }

interface Produto {
  produto: string
  produto_nome: string
  unid_med: string
  estoque_total: number
  custo_medio: number
  valor_total: number
  data_referencia: string | null
}

interface PostoCombustivel {
  empresa: string; posto_nome: string
  produtos: Produto[]
  total_valor: number; total_itens: number
}

interface GrupoPista { grupo_nome: string; produtos: Produto[]; total_valor: number; total_itens: number }
interface PostoPista  { empresa: string; posto_nome: string; grupos: GrupoPista[]; total_valor: number; total_itens: number }

interface SubgrupoConv { subgrupo_nome: string; produtos: Produto[]; total_valor: number; total_itens: number }
interface PostoConv    { empresa: string; posto_nome: string; subgrupos: SubgrupoConv[]; total_valor: number; total_itens: number }

type Tab = 'combustiveis' | 'pista' | 'conveniencia'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtQtd(v: number, unid: string) {
  if (unid === 'L') return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} L`
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${unid}`
}

function estoqueColor(pct: number) {
  if (pct >= 50) return 'bg-green-500'
  if (pct >= 20) return 'bg-yellow-400'
  return 'bg-red-500'
}
function estoqueTextColor(pct: number) {
  if (pct >= 50) return 'text-green-700'
  if (pct >= 20) return 'text-yellow-700'
  return 'text-red-600'
}
function estoqueBadgeColor(pct: number) {
  if (pct >= 50) return 'bg-green-100 text-green-700 border-green-200'
  if (pct >= 20) return 'bg-yellow-100 text-yellow-700 border-yellow-200'
  return 'bg-red-100 text-red-700 border-red-200'
}

// ─── Componente: Barra de produto ─────────────────────────────────────────────

function ProdutoBar({ produto, maxQtd }: { produto: Produto; maxQtd: number }) {
  const pct     = maxQtd > 0 ? Math.min(100, (produto.estoque_total / maxQtd) * 100) : 0
  const absPct  = pct  // percentual relativo ao máximo do grupo/posto

  return (
    <div className="flex items-center gap-3 py-1.5 px-0 group">
      {/* Nome do produto */}
      <div className="w-48 min-w-[12rem] shrink-0">
        <span className="text-[12px] text-gray-700 font-medium leading-tight line-clamp-2">{produto.produto_nome}</span>
      </div>

      {/* Barra */}
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden relative">
          <div
            className={cn('h-full rounded-full transition-all duration-500', estoqueColor(absPct))}
            style={{ width: `${Math.max(absPct, 1)}%` }}
          />
          {/* Quantidade dentro da barra */}
          <span className="absolute inset-0 flex items-center px-2 text-[10px] font-bold text-white mix-blend-difference pointer-events-none">
            {fmtQtd(produto.estoque_total, produto.unid_med)}
          </span>
        </div>
        <span className={cn('text-[11px] font-semibold w-8 text-right shrink-0', estoqueTextColor(absPct))}>
          {Math.round(absPct)}%
        </span>
      </div>

      {/* Valor */}
      <div className="shrink-0 text-right w-24">
        {produto.custo_medio > 0 && (
          <span className="text-[11px] text-gray-400">{formatCurrency(produto.valor_total)}</span>
        )}
      </div>
    </div>
  )
}

// ─── Componente: Card de posto ────────────────────────────────────────────────

function PostoCard({
  postoNome, totalValor, totalItens, children, defaultOpen = false,
}: {
  postoNome: string; totalValor: number; totalItens: number; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
            <Package className="w-4 h-4 text-orange-600" />
          </div>
          <div>
            <p className="font-bold text-[14px] text-gray-800">{postoNome}</p>
            <p className="text-[11px] text-gray-400">{totalItens} produto{totalItens !== 1 ? 's' : ''} em estoque</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {totalValor > 0 && (
            <span className="text-[12px] font-semibold text-gray-600 bg-white border border-gray-200 px-3 py-1 rounded-full">
              {formatCurrency(totalValor)}
            </span>
          )}
          <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', open && 'rotate-180')} />
        </div>
      </button>
      {open && <div className="px-5 py-3">{children}</div>}
    </div>
  )
}

// ─── Componente: Seção de grupo/subgrupo ──────────────────────────────────────

function GrupoSection({
  nome, produtos, totalValor, badgeColor = 'bg-blue-100 text-blue-700',
}: {
  nome: string; produtos: Produto[]; totalValor: number; badgeColor?: string
}) {
  const [open, setOpen] = useState(true)
  const maxQtd = Math.max(...produtos.map(p => p.estoque_total), 1)
  const baixos = produtos.filter(p => (p.estoque_total / maxQtd) * 100 < 20).length

  return (
    <div className="mb-4 last:mb-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between py-1.5 mb-1 text-left"
      >
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-gray-400" />
          <span className={cn('text-[11px] font-bold px-2.5 py-0.5 rounded-full border', badgeColor)}>{nome}</span>
          <span className="text-[11px] text-gray-400">{produtos.length} itens</span>
          {baixos > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
              <AlertTriangle className="w-3 h-3" /> {baixos} baixo{baixos > 1 ? 's' : ''}
            </span>
          )}
          {totalValor > 0 && (
            <span className="text-[11px] text-gray-400">{formatCurrency(totalValor)}</span>
          )}
        </div>
        <ChevronDown className={cn('w-3 h-3 text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="divide-y divide-gray-50 border-l-2 border-gray-100 pl-3 ml-1">
          {produtos.map(p => (
            <ProdutoBar key={p.produto} produto={p} maxQtd={maxQtd} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Aba: Combustíveis ────────────────────────────────────────────────────────

function TabCombustiveis({ dados, loading }: { dados: PostoCombustivel[]; loading: boolean }) {
  if (loading) return <LoadingState />
  if (!dados.length) return <EmptyState msg="Nenhum combustível em estoque encontrado." />

  return (
    <div className="space-y-3">
      {dados.map(posto => {
        const maxQtd = Math.max(...posto.produtos.map(p => p.estoque_total), 1)
        return (
          <PostoCard key={posto.empresa} postoNome={posto.posto_nome} totalValor={posto.total_valor} totalItens={posto.total_itens} defaultOpen>
            <div className="divide-y divide-gray-50">
              {posto.produtos.map(p => (
                <ProdutoBar key={p.produto} produto={p} maxQtd={maxQtd} />
              ))}
            </div>
          </PostoCard>
        )
      })}
    </div>
  )
}

// ─── Aba: Pista ───────────────────────────────────────────────────────────────

const CORES_GRUPO: Record<string, string> = {
  LUBRIFICANTES: 'bg-blue-100 text-blue-700 border-blue-200',
  ADITIVOS:      'bg-purple-100 text-purple-700 border-purple-200',
  FILTROS:       'bg-orange-100 text-orange-700 border-orange-200',
  BORRACHARIA:   'bg-gray-100 text-gray-700 border-gray-200',
  LAVADOR:       'bg-cyan-100 text-cyan-700 border-cyan-200',
  ARLA:          'bg-teal-100 text-teal-700 border-teal-200',
}

function TabPista({ dados, loading }: { dados: PostoPista[]; loading: boolean }) {
  if (loading) return <LoadingState />
  if (!dados.length) return <EmptyState msg="Nenhum produto de pista em estoque encontrado." />

  return (
    <div className="space-y-3">
      {dados.map(posto => (
        <PostoCard key={posto.empresa} postoNome={posto.posto_nome} totalValor={posto.total_valor} totalItens={posto.total_itens} defaultOpen>
          {posto.grupos.map(grupo => (
            <GrupoSection
              key={grupo.grupo_nome}
              nome={grupo.grupo_nome}
              produtos={grupo.produtos}
              totalValor={grupo.total_valor}
              badgeColor={CORES_GRUPO[grupo.grupo_nome] ?? 'bg-gray-100 text-gray-700 border-gray-200'}
            />
          ))}
        </PostoCard>
      ))}
    </div>
  )
}

// ─── Aba: Conveniência ────────────────────────────────────────────────────────

function TabConveniencia({ dados, loading }: { dados: PostoConv[]; loading: boolean }) {
  if (loading) return <LoadingState />
  if (!dados.length) return <EmptyState msg="Nenhum produto de conveniência em estoque encontrado." />

  return (
    <div className="space-y-3">
      {dados.map(posto => (
        <PostoCard key={posto.empresa} postoNome={posto.posto_nome} totalValor={posto.total_valor} totalItens={posto.total_itens}>
          {posto.subgrupos.map(sub => (
            <GrupoSection
              key={sub.subgrupo_nome}
              nome={sub.subgrupo_nome}
              produtos={sub.produtos}
              totalValor={sub.total_valor}
              badgeColor="bg-emerald-100 text-emerald-700 border-emerald-200"
            />
          ))}
        </PostoCard>
      ))}
    </div>
  )
}

// ─── Utils de estado ──────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
      <RefreshCw className="w-5 h-5 animate-spin" />
      <span className="text-[13px]">Carregando dados do AUTOSYSTEM...</span>
    </div>
  )
}
function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
      <Package className="w-8 h-8 opacity-30" />
      <p className="text-[13px]">{msg}</p>
    </div>
  )
}

// ─── KPI Cards ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: React.ElementType
  color: 'orange' | 'blue' | 'green' | 'purple'
}) {
  const colors = {
    orange: { bg: 'bg-orange-50', icon: 'bg-orange-100 text-orange-600', text: 'text-orange-700' },
    blue:   { bg: 'bg-blue-50',   icon: 'bg-blue-100 text-blue-600',     text: 'text-blue-700'   },
    green:  { bg: 'bg-green-50',  icon: 'bg-green-100 text-green-600',   text: 'text-green-700'  },
    purple: { bg: 'bg-purple-50', icon: 'bg-purple-100 text-purple-600', text: 'text-purple-700' },
  }
  const c = colors[color]
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-start gap-3">
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', c.icon)}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div>
        <p className="text-[11px] text-gray-500 font-medium">{label}</p>
        <p className="text-[20px] font-bold text-gray-900 leading-tight">{value}</p>
        {sub && <p className={cn('text-[11px] font-medium', c.text)}>{sub}</p>}
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function EstoquePage() {
  const supabase = createClient()
  const [postos,       setPostos]       = useState<PostoOpt[]>([])
  const [filtroEmpresa, setFiltroEmpresa] = useState('todos')
  const [tab,          setTab]          = useState<Tab>('combustiveis')

  const [dadosComb,  setDadosComb]  = useState<PostoCombustivel[]>([])
  const [dadosPista, setDadosPista] = useState<PostoPista[]>([])
  const [dadosConv,  setDadosConv]  = useState<PostoConv[]>([])

  const [loadingComb,  setLoadingComb]  = useState(false)
  const [loadingPista, setLoadingPista] = useState(false)
  const [loadingConv,  setLoadingConv]  = useState(false)

  useEffect(() => {
    supabase.from('postos').select('id, nome, codigo_empresa_externo')
      .not('codigo_empresa_externo', 'is', null).order('nome')
      .then(({ data }) => { if (data) setPostos(data as PostoOpt[]) })
  }, [])

  const load = useCallback(async (t: Tab) => {
    const params = new URLSearchParams()
    if (filtroEmpresa !== 'todos') params.set('empresa', filtroEmpresa)

    if (t === 'combustiveis') {
      setLoadingComb(true)
      try {
        const res = await fetch(`/api/estoque/combustiveis?${params}`)
        const json = await res.json()
        if (!res.ok) { toast({ variant: 'destructive', title: 'Erro', description: json.error }); return }
        setDadosComb(json.dados ?? [])
      } finally { setLoadingComb(false) }
    } else if (t === 'pista') {
      setLoadingPista(true)
      try {
        const res = await fetch(`/api/estoque/pista?${params}`)
        const json = await res.json()
        if (!res.ok) { toast({ variant: 'destructive', title: 'Erro', description: json.error }); return }
        setDadosPista(json.dados ?? [])
      } finally { setLoadingPista(false) }
    } else {
      setLoadingConv(true)
      try {
        const res = await fetch(`/api/estoque/conveniencia?${params}`)
        const json = await res.json()
        if (!res.ok) { toast({ variant: 'destructive', title: 'Erro', description: json.error }); return }
        setDadosConv(json.dados ?? [])
      } finally { setLoadingConv(false) }
    }
  }, [filtroEmpresa])

  useEffect(() => { load(tab) }, [tab, filtroEmpresa, load])

  // KPIs por aba
  const kpiComb = {
    postos: dadosComb.length,
    itens:  dadosComb.reduce((s, p) => s + p.total_itens, 0),
    valor:  dadosComb.reduce((s, p) => s + p.total_valor, 0),
  }
  const kpiPista = {
    postos: dadosPista.length,
    itens:  dadosPista.reduce((s, p) => s + p.total_itens, 0),
    valor:  dadosPista.reduce((s, p) => s + p.total_valor, 0),
  }
  const kpiConv = {
    postos: dadosConv.length,
    itens:  dadosConv.reduce((s, p) => s + p.total_itens, 0),
    valor:  dadosConv.reduce((s, p) => s + p.total_valor, 0),
  }

  const tabs: { key: Tab; label: string; icon: React.ElementType; color: string }[] = [
    { key: 'combustiveis', label: 'Combustíveis', icon: Fuel,       color: 'text-orange-600 border-orange-500 bg-orange-50' },
    { key: 'pista',        label: 'Pista',         icon: Wrench,     color: 'text-blue-600 border-blue-500 bg-blue-50'       },
    { key: 'conveniencia', label: 'Conveniência',   icon: ShoppingBag, color: 'text-green-600 border-green-500 bg-green-50'   },
  ]

  return (
    <div className="animate-fade-in">
      <Header
        title="Estoque"
        description="Visão do estoque atual por posto — AUTOSYSTEM"
        actions={
          <Button variant="outline" size="sm" onClick={() => load(tab)}
            disabled={loadingComb || loadingPista || loadingConv}
            className="gap-1.5 text-[13px]">
            <RefreshCw className={cn('w-3.5 h-3.5', (loadingComb || loadingPista || loadingConv) && 'animate-spin')} />
            Atualizar
          </Button>
        }
      />

      <div className="p-3 md:p-6 space-y-5">

        {/* ── Filtro de posto ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          <Select value={filtroEmpresa} onValueChange={setFiltroEmpresa}>
            <SelectTrigger className="h-9 w-full sm:w-[220px] text-[13px]">
              <SelectValue placeholder="Todos os postos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os postos</SelectItem>
              {postos.map(p => (
                <SelectItem key={p.id} value={p.codigo_empresa_externo!}>{p.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[12px] text-gray-400 hidden sm:block">Saldo atual — última atualização do AUTOSYSTEM</span>
        </div>

        {/* ── Abas ── */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto max-w-full">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all',
                tab === t.key
                  ? cn('bg-white shadow-sm border', t.color)
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/60',
              )}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* ── KPI Cards ── */}
        {tab === 'combustiveis' && !loadingComb && dadosComb.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <KpiCard label="Postos com estoque"  value={String(kpiComb.postos)} icon={Fuel}       color="orange" />
            <KpiCard label="Tipos de combustível" value={String(kpiComb.itens)} icon={Package}    color="blue"   />
            <KpiCard label="Valor em estoque"    value={formatCurrency(kpiComb.valor)} sub="Custo médio" icon={TrendingUp} color="green" />
          </div>
        )}
        {tab === 'pista' && !loadingPista && dadosPista.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <KpiCard label="Postos com estoque"  value={String(kpiPista.postos)} icon={Wrench}    color="blue"   />
            <KpiCard label="Produtos na pista"   value={String(kpiPista.itens)}  icon={Package}   color="orange" />
            <KpiCard label="Valor em estoque"    value={formatCurrency(kpiPista.valor)} sub="Custo médio" icon={TrendingUp} color="purple" />
          </div>
        )}
        {tab === 'conveniencia' && !loadingConv && dadosConv.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <KpiCard label="Postos com estoque"    value={String(kpiConv.postos)} icon={ShoppingBag} color="green"  />
            <KpiCard label="Produtos conveniência" value={String(kpiConv.itens)}  icon={Package}    color="blue"   />
            <KpiCard label="Valor em estoque"      value={formatCurrency(kpiConv.valor)} sub="Custo médio" icon={TrendingUp} color="purple" />
          </div>
        )}

        {/* ── Legenda das barras ── */}
        {!loadingComb && !loadingPista && !loadingConv && (
          <div className="flex items-center gap-4 text-[11px] text-gray-500">
            <span className="font-semibold text-gray-600">Legenda:</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> ≥ 50% do máximo</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" /> 20–49%</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> &lt; 20%</span>
          </div>
        )}

        {/* ── Conteúdo das abas ── */}
        {tab === 'combustiveis' && <TabCombustiveis dados={dadosComb} loading={loadingComb} />}
        {tab === 'pista'        && <TabPista        dados={dadosPista} loading={loadingPista} />}
        {tab === 'conveniencia' && <TabConveniencia dados={dadosConv}  loading={loadingConv} />}

      </div>
    </div>
  )
}
