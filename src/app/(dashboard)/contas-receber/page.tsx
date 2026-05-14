'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { useAuthContext } from '@/contexts/AuthContext'
import { can } from '@/lib/utils/permissions'
import { cn } from '@/lib/utils/cn'
import { formatCurrency } from '@/lib/utils/formatters'
import {
  RefreshCw, ChevronDown,
  CheckCircle2, CreditCard, CalendarDays,
  Search, Clock, Building2, TrendingUp,
  AlertCircle, Wallet, Tag,
  Banknote, CreditCard as CardIcon, FileText, Receipt, LayoutList,
  User, ArrowUpCircle, ArrowDownCircle, Percent,
} from 'lucide-react'
import type { Role } from '@/types/database.types'

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface PostoOpt { id: string; nome: string; codigo_empresa_externo: string | null }

interface ResumoLinha {
  conta_debitar: string; conta_nome: string | null; empresa: string; posto_nome: string
  mes: string; pago: boolean; qtd: number; valor_total: number; pessoa_nome: string; grupo: string | null
}

interface Transacao {
  vencto: string; data: string; documento: string | null; tipo_doc: string | null
  valor: number; empresa: string; posto_nome: string; pago: boolean; data_baixa: string | null; pessoa_nome?: string
}

// ─── Config grupos ────────────────────────────────────────────────────────────

const GRUPOS_CR = [
  { value: 'dinheiro',      label: 'Dinheiro',          icon: Banknote,   color: 'emerald' },
  { value: 'cartoes',       label: 'Cartões',            icon: CardIcon,   color: 'blue'    },
  { value: 'cheques',       label: 'Cheques',            icon: FileText,   color: 'purple'  },
  { value: 'notas_prazo',   label: 'Notas a Prazo',      icon: Receipt,    color: 'orange'  },
  { value: 'faturas',       label: 'Faturas / Clientes', icon: LayoutList, color: 'cyan'    },
  { value: '__sem_grupo__', label: 'Não classificado',   icon: Tag,        color: 'gray'    },
] as const

type GrupoColor = 'emerald' | 'blue' | 'purple' | 'orange' | 'cyan' | 'gray'

const COLOR_MAP: Record<GrupoColor, { bg: string; icon: string; badge: string; border: string; bar: string }> = {
  emerald: { bg: 'bg-emerald-50', icon: 'bg-emerald-100 text-emerald-700', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', border: 'border-emerald-200', bar: 'bg-emerald-500' },
  blue:    { bg: 'bg-blue-50',    icon: 'bg-blue-100 text-blue-700',       badge: 'bg-blue-100 text-blue-700 border-blue-200',           border: 'border-blue-200',    bar: 'bg-blue-500'    },
  purple:  { bg: 'bg-purple-50',  icon: 'bg-purple-100 text-purple-700',   badge: 'bg-purple-100 text-purple-700 border-purple-200',     border: 'border-purple-200',  bar: 'bg-purple-500'  },
  orange:  { bg: 'bg-orange-50',  icon: 'bg-orange-100 text-orange-700',   badge: 'bg-orange-100 text-orange-700 border-orange-200',     border: 'border-orange-200',  bar: 'bg-orange-500'  },
  cyan:    { bg: 'bg-cyan-50',    icon: 'bg-cyan-100 text-cyan-700',       badge: 'bg-cyan-100 text-cyan-700 border-cyan-200',           border: 'border-cyan-200',    bar: 'bg-cyan-500'    },
  gray:    { bg: 'bg-gray-50',    icon: 'bg-gray-100 text-gray-600',       badge: 'bg-gray-100 text-gray-600 border-gray-200',           border: 'border-gray-200',    bar: 'bg-gray-400'    },
}

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
function fmtMes(yyyymm: string) { const [y,m] = yyyymm.split('-'); return `${MESES[+m-1]} ${y}` }
function fmtData(iso: string | null) { if (!iso) return '—'; return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) }
function anoAtual() { return new Date().getFullYear() }
function mesAtualPeriodo() {
  const now = new Date()
  const ano = now.getFullYear()
  const mesIdx = now.getMonth()
  const mes = String(mesIdx + 1).padStart(2, '0')
  const lastDay = new Date(ano, mesIdx + 1, 0).getDate()
  return { ini: `${ano}-${mes}-01`, fim: `${ano}-${mes}-${String(lastDay).padStart(2, '0')}` }
}

const PERIODO_STORAGE_KEY = 'contas-receber:periodo'

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, cls }: {
  label: string; value: string; sub?: string; icon: React.ElementType; cls: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-5 flex items-center gap-4">
      <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0', cls)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide truncate">{label}</p>
        <p className="text-[20px] md:text-[24px] font-bold text-gray-900 leading-tight tabular-nums truncate">{value}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Tabela de transações ─────────────────────────────────────────────────────

function TabelaTransacoes({ transacoes }: { transacoes: Transacao[] }) {
  const aReceber = transacoes.filter(t => !t.pago)
  const recebidos = transacoes.filter(t => t.pago)

  function Grupo({ rows, tipo }: { rows: Transacao[]; tipo: 'receber' | 'recebido' }) {
    if (!rows.length) return null
    const isReceber = tipo === 'receber'
    return (
      <>
        <tr className={isReceber ? 'bg-orange-50' : 'bg-emerald-50'}>
          <td colSpan={99} className={cn('px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider', isReceber ? 'text-orange-700' : 'text-emerald-700')}>
            {isReceber
              ? <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> A Receber ({rows.length})</span>
              : <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Recebidos ({rows.length})</span>}
          </td>
        </tr>
        {rows.map((t, i) => (
          <tr key={i} className={cn('hover:brightness-95 transition-colors text-[12px]', isReceber ? 'bg-orange-50/30' : '')}>
            <td className="hidden sm:table-cell px-4 py-2 font-mono text-gray-500">{t.documento ?? '—'}</td>
            <td className="hidden md:table-cell px-3 py-2 text-gray-400">{t.tipo_doc ?? '—'}</td>
            <td className="px-3 py-2 text-gray-700 max-w-[150px]">
              <span className="truncate block">{t.pessoa_nome || '—'}</span>
            </td>
            <td className="hidden sm:table-cell px-3 py-2 text-gray-500 whitespace-nowrap">{fmtData(t.data)}</td>
            <td className="px-3 py-2 whitespace-nowrap">
              <span className={isReceber ? 'text-orange-600 font-medium' : 'text-gray-600'}>{fmtData(t.vencto)}</span>
            </td>
            <td className="px-3 py-2 text-right font-mono font-semibold text-gray-800 whitespace-nowrap">{formatCurrency(t.valor)}</td>
            <td className="px-3 py-2 whitespace-nowrap">
              {t.pago
                ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3 h-3" />Recebido</span>
                : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-700"><Clock className="w-3 h-3" />A Receber</span>}
            </td>
          </tr>
        ))}
      </>
    )
  }

  const totReceber  = aReceber.reduce((s, t) => s + t.valor, 0)
  const totRecebido = recebidos.reduce((s, t) => s + t.valor, 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th className="hidden sm:table-cell text-left px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Documento</th>
            <th className="hidden md:table-cell text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Tipo</th>
            <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Cliente</th>
            <th className="hidden sm:table-cell text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Lançamento</th>
            <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Vencimento</th>
            <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Valor</th>
            <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          <Grupo rows={aReceber}  tipo="receber"  />
          <Grupo rows={recebidos} tipo="recebido" />
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 bg-gray-50">
            <td colSpan={5} className="px-4 py-2 text-[11px] font-semibold">
              <span className="flex gap-4">
                {totReceber > 0  && <span className="text-orange-600">{formatCurrency(totReceber)} a receber</span>}
                {totRecebido > 0 && <span className="text-emerald-600">{formatCurrency(totRecebido)} recebido</span>}
              </span>
            </td>
            <td className="px-3 py-2 text-right font-mono font-bold text-gray-800">{formatCurrency(totReceber + totRecebido)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function ContasReceberPage() {
  const { usuario } = useAuthContext()
  const supabase = createClient()
  const role = usuario?.role as Role | undefined

  const [postos,        setPostos]        = useState<PostoOpt[]>([])
  const [resumoLinhas,  setResumoLinhas]  = useState<ResumoLinha[]>([])
  const [loadingFormas, setLoadingFormas] = useState(false)
  const [filtroEmpresa, setFiltroEmpresa] = useState('todos')
  // Default = mês atual; sobrescrito por localStorage no mount (vide useEffect abaixo).
  const [filtroDataIni, setFiltroDataIni] = useState(() => mesAtualPeriodo().ini)
  const [filtroDataFim, setFiltroDataFim] = useState(() => mesAtualPeriodo().fim)
  const [periodoHidratado, setPeriodoHidratado] = useState(false)
  const [filtroStatus,  setFiltroStatus]  = useState<'todos' | 'receber' | 'recebido'>('todos')
  const [search,        setSearch]        = useState('')

  const [expandidosGrupo,  setExpandidosGrupo]  = useState<Set<string>>(new Set())
  const [expandidosForma,  setExpandidosForma]  = useState<Set<string>>(new Set())
  const [expandidosPosto,  setExpandidosPosto]  = useState<Set<string>>(new Set())
  const [expandidosMes,    setExpandidosMes]    = useState<Set<string>>(new Set())
  const [detalheCache,     setDetalheCache]     = useState<Record<string, Transacao[]>>({})
  const [loadingDetalhe,   setLoadingDetalhe]   = useState<Set<string>>(new Set())

  useEffect(() => {
    supabase.from('postos').select('id, nome, codigo_empresa_externo')
      .not('codigo_empresa_externo', 'is', null).order('nome')
      .then(({ data }) => { if (data) setPostos(data as PostoOpt[]) })
  }, [])

  // Carrega período salvo no mount (se houver). Caso contrário mantém o mês atual.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PERIODO_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as { ini?: string; fim?: string }
        if (parsed.ini && parsed.fim) {
          setFiltroDataIni(parsed.ini)
          setFiltroDataFim(parsed.fim)
        }
      }
    } catch { /* localStorage indisponível ou conteúdo inválido — usa default */ }
    setPeriodoHidratado(true)
  }, [])

  // Persiste o período sempre que muda (após hidratar, pra não sobrescrever com o default).
  useEffect(() => {
    if (!periodoHidratado) return
    try {
      localStorage.setItem(PERIODO_STORAGE_KEY, JSON.stringify({ ini: filtroDataIni, fim: filtroDataFim }))
    } catch { /* ignore */ }
  }, [periodoHidratado, filtroDataIni, filtroDataFim])

  const loadFormas = useCallback(async () => {
    setLoadingFormas(true)
    setDetalheCache({})
    setExpandidosPosto(new Set())
    setExpandidosMes(new Set())
    try {
      const params = new URLSearchParams()
      if (filtroEmpresa !== 'todos') params.set('empresa', filtroEmpresa)
      if (filtroDataIni) params.set('data_ini', filtroDataIni)
      if (filtroDataFim) params.set('data_fim', filtroDataFim)
      const res  = await fetch(`/api/contas-receber/formas?${params}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast({ variant: 'destructive', title: 'Erro ao carregar', description: json.error ?? `HTTP ${res.status}` }); return }
      setResumoLinhas(json.resumo ?? [])
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro inesperado', description: String(err?.message ?? err) })
    } finally { setLoadingFormas(false) }
  }, [filtroEmpresa, filtroDataIni, filtroDataFim])

  useEffect(() => {
    if (!periodoHidratado) return
    loadFormas()
  }, [loadFormas, periodoHidratado])

  async function loadDetalhe(conta: string, empresa: string, mes: string) {
    const key = `${conta}|${empresa}|${mes}`
    if (detalheCache[key] !== undefined) return
    setLoadingDetalhe(prev => new Set(prev).add(key))
    try {
      const params = new URLSearchParams({ conta, mes })
      if (empresa) params.set('empresa', empresa)
      const res  = await fetch(`/api/contas-receber/formas/detalhe?${params}`)
      const json = await res.json()
      if (!res.ok) { toast({ variant: 'destructive', title: 'Erro ao carregar detalhe', description: json.error }); return }
      setDetalheCache(prev => ({ ...prev, [key]: json.transacoes ?? [] }))
    } finally {
      setLoadingDetalhe(prev => { const next = new Set(prev); next.delete(key); return next })
    }
  }

  // ── Estrutura de dados ──────────────────────────────────────────────────────

  interface MesResumo { mesKey: string; totalValor: number; recebidoValor: number; receberValor: number; qtdReceber: number; qtdRecebido: number }
  interface GrupoForma { contaCodigo: string; contaNome: string; grupo: string | null; postos: GrupoPosto[]; totalValor: number; receberValor: number; recebidoValor: number }
  interface GrupoPosto { empresa: string; postoNome: string; meses: MesResumo[]; totalValor: number; receberValor: number }
  interface GrupoPrincipal { grupoKey: string; formas: GrupoForma[]; totalValor: number; receberValor: number; recebidoValor: number }

  const gruposFormas = useMemo<GrupoForma[]>(() => {
    const lista = resumoLinhas
      .filter(r => search ? (r.conta_nome?.toLowerCase().includes(search.toLowerCase()) || r.posto_nome?.toLowerCase().includes(search.toLowerCase())) : true)
      .filter(r => filtroStatus === 'todos' ? true : filtroStatus === 'receber' ? !r.pago : r.pago)

    const formaMap = new Map<string, {
      contaNome: string; grupo: string | null
      postoMap: Map<string, { postoNome: string; mesMap: Map<string, { rec: number; recVal: number; ab: number; abVal: number }> }>
    }>()

    for (const r of lista) {
      if (!formaMap.has(r.conta_debitar))
        formaMap.set(r.conta_debitar, { contaNome: r.conta_nome ?? r.conta_debitar, grupo: r.grupo ?? null, postoMap: new Map() })
      const forma = formaMap.get(r.conta_debitar)!
      if (!forma.postoMap.has(r.empresa))
        forma.postoMap.set(r.empresa, { postoNome: r.posto_nome, mesMap: new Map() })
      const posto = forma.postoMap.get(r.empresa)!
      if (!posto.mesMap.has(r.mes)) posto.mesMap.set(r.mes, { rec: 0, recVal: 0, ab: 0, abVal: 0 })
      const e = posto.mesMap.get(r.mes)!
      if (r.pago) { e.rec += r.qtd; e.recVal += r.valor_total }
      else        { e.ab  += r.qtd; e.abVal  += r.valor_total }
    }

    return Array.from(formaMap.entries()).map(([codigo, { contaNome, grupo, postoMap }]) => {
      const postos: GrupoPosto[] = Array.from(postoMap.entries()).map(([empresa, { postoNome, mesMap }]) => {
        const meses: MesResumo[] = Array.from(mesMap.entries())
          .map(([mesKey, e]) => ({
            mesKey,
            totalValor:     e.recVal + e.abVal,
            recebidoValor:  e.recVal,
            receberValor:   e.abVal,
            qtdReceber:     e.ab,
            qtdRecebido:    e.rec,
          }))
          .sort((a, b) => b.mesKey.localeCompare(a.mesKey))
        return {
          empresa, postoNome, meses,
          totalValor:   meses.reduce((s, m) => s + m.totalValor, 0),
          receberValor: meses.reduce((s, m) => s + m.receberValor, 0),
        }
      }).sort((a, b) => b.receberValor - a.receberValor || a.postoNome.localeCompare(b.postoNome))

      return {
        contaCodigo: codigo, contaNome, grupo,
        postos,
        totalValor:    postos.reduce((s, p) => s + p.totalValor, 0),
        receberValor:  postos.reduce((s, p) => s + p.receberValor, 0),
        recebidoValor: postos.reduce((s, p) => s + p.totalValor - p.receberValor, 0),
      }
    })
    .filter(g => g.postos.length > 0)
    .sort((a, b) => a.contaNome.localeCompare(b.contaNome, 'pt-BR'))
  }, [resumoLinhas, search, filtroStatus])

  const gruposPrincipais = useMemo<GrupoPrincipal[]>(() => {
    const map = new Map<string, GrupoForma[]>()
    for (const g of GRUPOS_CR) map.set(g.value, [])
    for (const f of gruposFormas) {
      const key = f.grupo ?? '__sem_grupo__'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(f)
    }
    return GRUPOS_CR.map(g => {
      const formas = map.get(g.value) ?? []
      return {
        grupoKey: g.value,
        formas,
        totalValor:    formas.reduce((s, f) => s + f.totalValor, 0),
        receberValor:  formas.reduce((s, f) => s + f.receberValor, 0),
        recebidoValor: formas.reduce((s, f) => s + f.recebidoValor, 0),
      }
    }).filter(g => g.formas.length > 0)
  }, [gruposFormas])

  const kpis = useMemo(() => {
    const total     = gruposFormas.reduce((s, g) => s + g.totalValor, 0)
    const receber   = gruposFormas.reduce((s, g) => s + g.receberValor, 0)
    const recebido  = total - receber
    const pct       = total > 0 ? Math.round((recebido / total) * 100) : 0
    const formasOk  = gruposFormas.filter(g => g.receberValor === 0).length
    const formasPend = gruposFormas.filter(g => g.receberValor > 0).length
    return { total, receber, recebido, pct, formasOk, formasPend }
  }, [gruposFormas])

  function toggle<T>(set: Set<T>, key: T): Set<T> { const n = new Set(set); n.has(key) ? n.delete(key) : n.add(key); return n }

  if (role && !can(role, 'contas_receber.view')) {
    return <div className="flex items-center justify-center h-64 text-gray-400"><p>Acesso restrito.</p></div>
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="Contas a Receber"
        description="Controle de recebíveis por forma de pagamento — AUTOSYSTEM"
        actions={
          <Button variant="outline" size="sm" disabled={loadingFormas} onClick={loadFormas} className="gap-1.5 text-[13px]">
            <RefreshCw className={cn('w-3.5 h-3.5', loadingFormas && 'animate-spin')} />
            <span className="btn-text">Atualizar</span>
          </Button>
        }
      />

      <div className="p-3 md:p-6 space-y-5">

        {/* ── KPIs ── */}
        {!loadingFormas && gruposFormas.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Total do Período"    value={formatCurrency(kpis.total)}    sub={`${gruposFormas.length} formas de pagamento`}    icon={Wallet}          cls="bg-blue-500 text-white" />
            <KpiCard label="A Receber"           value={formatCurrency(kpis.receber)}  sub={`${kpis.formasPend} forma${kpis.formasPend !== 1 ? 's' : ''} pendente${kpis.formasPend !== 1 ? 's' : ''}`} icon={Clock} cls="bg-orange-500 text-white" />
            <KpiCard label="Recebidos"           value={formatCurrency(kpis.recebido)} sub={`${kpis.formasOk} forma${kpis.formasOk !== 1 ? 's' : ''} concluída${kpis.formasOk !== 1 ? 's' : ''}`}       icon={CheckCircle2} cls="bg-emerald-500 text-white" />
            <KpiCard label="Taxa de Recebimento" value={`${kpis.pct}%`}               sub={kpis.pct === 100 ? 'Tudo recebido!' : `${100 - kpis.pct}% ainda a receber`} icon={Percent} cls={kpis.pct >= 80 ? 'bg-emerald-100 text-emerald-700' : kpis.pct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'} />
          </div>
        )}

        {/* ── Barra de progresso ── */}
        {!loadingFormas && kpis.total > 0 && (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-gray-400" />
                <span className="text-[13px] font-semibold text-gray-700">Progresso de Recebimento</span>
              </div>
              <span className="text-[13px] font-bold text-gray-800">{kpis.pct}%</span>
            </div>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden flex">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${kpis.pct}%` }} />
            </div>
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-1.5">
                <ArrowDownCircle className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-[12px] text-emerald-600 font-semibold">{formatCurrency(kpis.recebido)} recebido</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] text-orange-600 font-semibold">{formatCurrency(kpis.receber)} a receber</span>
                <ArrowUpCircle className="w-3.5 h-3.5 text-orange-500" />
              </div>
            </div>
          </div>
        )}

        {/* ── Filtros ── */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input placeholder="Buscar forma ou posto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-[13px]" />
            </div>
            <Select value={filtroEmpresa} onValueChange={setFiltroEmpresa}>
              <SelectTrigger className="h-9 w-full sm:w-[200px] text-[13px]"><SelectValue placeholder="Todos os postos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os postos</SelectItem>
                {postos.map(p => <SelectItem key={p.id} value={p.codigo_empresa_externo!}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Filtro rápido por mês */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Mês de vencimento</p>
            <div className="flex flex-wrap gap-1.5">
              {(['01','02','03','04','05','06','07','08','09','10','11','12'] as const).map((m, i) => {
                const ano = new Date().getFullYear()
                const ini = `${ano}-${m}-01`
                const lastDay = new Date(ano, i + 1, 0).getDate()
                const fim = `${ano}-${m}-${String(lastDay).padStart(2,'0')}`
                const ativo = filtroDataIni === ini && filtroDataFim === fim
                return (
                  <button key={m} onClick={() => { setFiltroDataIni(ini); setFiltroDataFim(fim) }}
                    className={cn('px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all',
                      ativo ? 'bg-[#8B1A14] text-white border-[#8B1A14]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    )}>
                    {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][i]}
                  </button>
                )
              })}
              <button
                onClick={() => { setFiltroDataIni(`${new Date().getFullYear()}-01-01`); setFiltroDataFim(`${new Date().getFullYear()}-12-31`) }}
                className={cn('px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all',
                  filtroDataIni === `${new Date().getFullYear()}-01-01` && filtroDataFim === `${new Date().getFullYear()}-12-31`
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                )}>
                Ano todo
              </button>
            </div>
          </div>

          {/* Filtro de data personalizado */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Vencimento de</p>
              <Input type="date" value={filtroDataIni} onChange={e => setFiltroDataIni(e.target.value)} className="h-9 text-[13px]" />
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">até</p>
              <Input type="date" value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)} className="h-9 text-[13px]" />
            </div>
          </div>

          {/* Filtro de status */}
          <div className="flex gap-2">
            {([
              { v: 'todos',    label: 'Todos',       icon: null,          active: 'bg-gray-900 text-white border-gray-900' },
              { v: 'receber',  label: 'A Receber',   icon: Clock,         active: 'bg-orange-500 text-white border-orange-500' },
              { v: 'recebido', label: 'Recebidos',   icon: CheckCircle2,  active: 'bg-emerald-500 text-white border-emerald-500' },
            ] as const).map(({ v, label, icon: Icon, active }) => (
              <button
                key={v}
                onClick={() => setFiltroStatus(v)}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12px] font-semibold border transition-all',
                  filtroStatus === v ? active : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                )}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {label}
              </button>
            ))}
            {kpis.receber > 0 && filtroStatus === 'todos' && (
              <span className="ml-auto flex items-center gap-1.5 text-[11px] text-orange-600 font-semibold">
                <AlertCircle className="w-3.5 h-3.5" />
                {formatCurrency(kpis.receber)} pendente
              </span>
            )}
          </div>
        </div>

        {/* ── Conteúdo ── */}
        {loadingFormas ? (
          <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-[13px]">Carregando dados do AUTOSYSTEM...</span>
          </div>
        ) : gruposPrincipais.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
            <CreditCard className="w-8 h-8 opacity-30" />
            <p className="text-[13px]">Nenhuma forma de pagamento encontrada para o período.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {gruposPrincipais.map(grupo => {
              const gcfg = GRUPOS_CR.find(g => g.value === grupo.grupoKey)!
              const cls  = COLOR_MAP[gcfg?.color as GrupoColor ?? 'gray']
              const GrupoIcon = gcfg?.icon ?? Tag
              const grupoExpanded = expandidosGrupo.has(grupo.grupoKey)
              const pctGrupo = grupo.totalValor > 0 ? Math.round((grupo.recebidoValor / grupo.totalValor) * 100) : 100

              return (
                <div key={grupo.grupoKey} className={cn('rounded-2xl border-2 overflow-hidden shadow-sm bg-white', cls.border)}>

                  {/* Cabeçalho do grupo */}
                  <button
                    className={cn('w-full flex items-center gap-4 px-5 py-4 text-left transition-colors hover:brightness-95', cls.bg)}
                    onClick={() => setExpandidosGrupo(toggle(expandidosGrupo, grupo.grupoKey))}
                  >
                    <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', cls.icon)}>
                      <GrupoIcon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-[14px] text-gray-800">{gcfg?.label}</span>
                        <span className="text-[11px] text-gray-500">{grupo.formas.length} forma{grupo.formas.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <div className="w-28 h-1.5 bg-white/70 rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all', cls.bar)} style={{ width: `${pctGrupo}%` }} />
                        </div>
                        <span className="text-[12px] text-gray-700 font-semibold">{formatCurrency(grupo.totalValor)}</span>
                        {grupo.receberValor > 0 && (
                          <span className="text-[11px] text-orange-600 font-medium">{formatCurrency(grupo.receberValor)} a receber</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {grupo.receberValor > 0
                        ? <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 border border-orange-200 flex items-center gap-1"><Clock className="w-3 h-3" /> A Receber</span>
                        : <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Recebido</span>}
                      <ChevronDown className={cn('w-4 h-4 text-gray-500 transition-transform', grupoExpanded && 'rotate-180')} />
                    </div>
                  </button>

                  {/* Formas dentro do grupo */}
                  {grupoExpanded && (
                    <div className="divide-y divide-gray-100">
                      {grupo.formas.map(forma => {
                        const formaExpanded = expandidosForma.has(forma.contaCodigo)
                        const pctForma = forma.totalValor > 0 ? Math.round((forma.recebidoValor / forma.totalValor) * 100) : 100

                        return (
                          <div key={forma.contaCodigo}>
                            {/* Nível 1: Forma de Pagamento */}
                            <button
                              className="w-full flex items-center gap-3 px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                              onClick={() => setExpandidosForma(toggle(expandidosForma, forma.contaCodigo))}
                            >
                              <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0', forma.receberValor > 0 ? 'bg-orange-100 text-orange-600' : 'bg-emerald-100 text-emerald-600')}>
                                <CreditCard className="w-3.5 h-3.5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-[13px] text-gray-800">{forma.contaNome}</span>
                                  <span className="text-[11px] text-gray-400">{forma.postos.length} posto{forma.postos.length !== 1 ? 's' : ''}</span>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <div className="w-20 h-1 bg-gray-200 rounded-full overflow-hidden">
                                    <div className={cn('h-full rounded-full', pctForma === 100 ? 'bg-emerald-500' : 'bg-orange-400')} style={{ width: `${pctForma}%` }} />
                                  </div>
                                  <span className="text-[11px] text-gray-400">{pctForma}% · {formatCurrency(forma.totalValor)}</span>
                                  {forma.receberValor > 0 && <span className="text-[11px] text-orange-500 font-medium">· {formatCurrency(forma.receberValor)} a receber</span>}
                                </div>
                              </div>
                              <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0', formaExpanded && 'rotate-180')} />
                            </button>

                            {/* Nível 2: Postos */}
                            {formaExpanded && (
                              <div className="divide-y divide-gray-50 bg-white">
                                {forma.postos.map(posto => {
                                  const postoKey = `${forma.contaCodigo}|${posto.empresa}`
                                  const postoExpanded = expandidosPosto.has(postoKey)

                                  return (
                                    <div key={posto.empresa}>
                                      <button
                                        className="w-full flex items-center justify-between px-7 py-2.5 hover:bg-gray-50 transition-colors text-left"
                                        onClick={() => setExpandidosPosto(toggle(expandidosPosto, postoKey))}
                                      >
                                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                          <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                          <span className="text-[13px] font-semibold text-gray-700 truncate">{posto.postoNome}</span>
                                          <div className="flex items-center gap-2 text-[11px] text-gray-400">
                                            <span>{posto.meses.length} {posto.meses.length === 1 ? 'mês' : 'meses'}</span>
                                            <span>·</span>
                                            <span className="font-semibold text-gray-600">{formatCurrency(posto.totalValor)}</span>
                                            {posto.receberValor > 0 && <span className="text-orange-500 font-medium">· {formatCurrency(posto.receberValor)} a receber</span>}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                          {posto.receberValor > 0
                                            ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium flex items-center gap-1"><Clock className="w-3 h-3" /> Pendente</span>
                                            : <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> OK</span>}
                                          <ChevronDown className={cn('w-3 h-3 text-gray-400 transition-transform', postoExpanded && 'rotate-180')} />
                                        </div>
                                      </button>

                                      {/* Nível 3: Meses */}
                                      {postoExpanded && (
                                        <div className="divide-y divide-gray-50 bg-gray-50/40">
                                          {posto.meses.map(mes => {
                                            const mesKey = `${forma.contaCodigo}|${posto.empresa}|${mes.mesKey}`
                                            const mesExpanded = expandidosMes.has(mesKey)
                                            const transacoes  = detalheCache[mesKey]
                                            const carregando  = loadingDetalhe.has(mesKey)
                                            const totalTrans  = mes.qtdReceber + mes.qtdRecebido
                                            const pctMes = mes.totalValor > 0 ? Math.round((mes.recebidoValor / mes.totalValor) * 100) : 100

                                            return (
                                              <div key={mes.mesKey} className={mes.receberValor > 0 ? 'bg-orange-50/20' : ''}>
                                                <button
                                                  className="w-full flex items-center justify-between px-10 py-2.5 hover:bg-gray-100/60 transition-colors text-left"
                                                  onClick={() => {
                                                    setExpandidosMes(toggle(expandidosMes, mesKey))
                                                    if (!expandidosMes.has(mesKey)) loadDetalhe(forma.contaCodigo, posto.empresa, mes.mesKey)
                                                  }}
                                                >
                                                  <div className="flex items-center gap-3">
                                                    <CalendarDays className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                                    <span className="text-[12px] font-semibold text-gray-700 w-28">{fmtMes(mes.mesKey)}</span>
                                                    <span className="text-[11px] text-gray-400">{totalTrans} transaç{totalTrans !== 1 ? 'ões' : 'ão'}</span>
                                                    <div className="hidden sm:flex items-center gap-1.5">
                                                      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                        <div className={cn('h-full rounded-full', pctMes === 100 ? 'bg-emerald-500' : 'bg-orange-400')} style={{ width: `${pctMes}%` }} />
                                                      </div>
                                                      <span className="text-[10px] text-gray-400">{pctMes}%</span>
                                                    </div>
                                                  </div>
                                                  <div className="flex items-center gap-2">
                                                    {mes.receberValor > 0
                                                      ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200 flex items-center gap-1"><Clock className="w-3 h-3" /> {mes.qtdReceber} a receber</span>
                                                      : <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Recebido</span>}
                                                    <span className="text-[12px] font-semibold text-gray-700 w-24 text-right">{formatCurrency(mes.totalValor)}</span>
                                                    <ChevronDown className={cn('w-3 h-3 text-gray-400 transition-transform', mesExpanded && 'rotate-180')} />
                                                  </div>
                                                </button>

                                                {mesExpanded && (
                                                  <div className="border-t border-gray-100">
                                                    {carregando ? (
                                                      <div className="flex items-center justify-center py-5 gap-2 text-gray-400 text-[12px]">
                                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Carregando transações...
                                                      </div>
                                                    ) : (
                                                      <TabelaTransacoes transacoes={transacoes ?? []} />
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            )
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
