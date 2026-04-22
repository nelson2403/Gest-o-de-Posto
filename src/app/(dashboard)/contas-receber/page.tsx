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
  RefreshCw, ChevronDown, ChevronsUpDown,
  CheckCircle2, CreditCard, CalendarDays,
  Search, Clock, Building2, TrendingUp,
  AlertCircle, Wallet, BarChart3, Tag,
  Banknote, CreditCard as CardIcon, FileText, Receipt, LayoutList,
  User,
} from 'lucide-react'
import type { Role } from '@/types/database.types'

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface PostoOpt {
  id: string
  nome: string
  codigo_empresa_externo: string | null
}

interface ResumoLinha {
  conta_debitar: string
  conta_nome: string | null
  empresa: string
  posto_nome: string
  mes: string
  pago: boolean
  qtd: number
  valor_total: number
  pessoa_nome: string
  grupo: string | null
}

// ─── Grupos de recebíveis ─────────────────────────────────────────────────────

const GRUPOS_CR = [
  { value: 'dinheiro',    label: 'Dinheiro',      icon: Banknote,    bg: 'bg-green-50',  border: 'border-green-200',  badge: 'bg-green-100 text-green-800 border-green-200',   header: 'bg-green-50/80'  },
  { value: 'cartoes',     label: 'Cartões',        icon: CardIcon,    bg: 'bg-blue-50',   border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-800 border-blue-200',      header: 'bg-blue-50/80'   },
  { value: 'cheques',     label: 'Cheques',        icon: FileText,    bg: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-800 border-purple-200', header: 'bg-purple-50/80' },
  { value: 'notas_prazo', label: 'Notas a Prazo',  icon: Receipt,     bg: 'bg-orange-50', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-800 border-orange-200', header: 'bg-orange-50/80' },
  { value: 'faturas',     label: 'Faturas',        icon: LayoutList,  bg: 'bg-cyan-50',   border: 'border-cyan-200',   badge: 'bg-cyan-100 text-cyan-800 border-cyan-200',       header: 'bg-cyan-50/80'   },
  { value: '__sem_grupo__', label: 'Não classificado', icon: Tag,     bg: 'bg-gray-50',   border: 'border-gray-200',   badge: 'bg-gray-100 text-gray-600 border-gray-200',       header: 'bg-gray-50'      },
] as const

interface Transacao {
  vencto: string
  data: string
  documento: string | null
  tipo_doc: string | null
  valor: number
  empresa: string
  posto_nome: string
  pago: boolean
  data_baixa: string | null
  pessoa_nome?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtData(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

function TabelaTransacoes({ transacoes, paddingLeft = 'px-8' }: { transacoes: Transacao[]; paddingLeft?: string }) {
  const abertas  = transacoes.filter(t => !t.pago)
  const baixadas = transacoes.filter(t => t.pago)
  const hasBoth  = abertas.length > 0 && baixadas.length > 0

  function Rows({ rows, tipo }: { rows: Transacao[]; tipo: 'aberto' | 'baixado' }) {
    if (!rows.length) return null
    return (
      <>
        <tr className={cn('border-t', tipo === 'aberto' ? 'border-orange-200 bg-orange-50' : 'border-green-200 bg-green-50')}>
          <td colSpan={7} className={cn(`${paddingLeft} py-1 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5`, tipo === 'aberto' ? 'text-orange-700' : 'text-green-700')}>
            {tipo === 'aberto' ? <><Clock className="w-3 h-3 inline" /> Em Aberto ({rows.length})</> : <><CheckCircle2 className="w-3 h-3 inline" /> Baixado ({rows.length})</>}
          </td>
        </tr>
        {rows.map((mov, i) => (
          <tr key={i} className={cn('hover:bg-gray-50/60 transition-colors', tipo === 'aberto' ? 'bg-orange-50/20' : '')}>
            <td className={`${paddingLeft} py-2 font-mono text-gray-500 text-[12px]`}>{mov.documento ?? '—'}</td>
            <td className="px-4 py-2 text-gray-500 text-[12px]">{mov.tipo_doc ?? '—'}</td>
            <td className="px-4 py-2 text-gray-500 whitespace-nowrap text-[12px]">{fmtData(mov.data)}</td>
            <td className="px-4 py-2 whitespace-nowrap text-[12px]"><span className={cn('font-medium', tipo === 'aberto' ? 'text-orange-600' : 'text-gray-600')}>{fmtData(mov.vencto)}</span></td>
            <td className="px-4 py-2 text-right font-mono font-medium text-gray-800 whitespace-nowrap text-[12px]">{formatCurrency(mov.valor)}</td>
            <td className="px-4 py-2 text-center whitespace-nowrap">
              {mov.pago
                ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3" />Baixado</span>
                : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-700"><Clock className="w-3 h-3" />Em Aberto</span>
              }
            </td>
            <td className="px-4 py-2 whitespace-nowrap text-gray-500 text-[12px]">{mov.data_baixa ? fmtData(mov.data_baixa) : '—'}</td>
          </tr>
        ))}
      </>
    )
  }

  const totalAberto = abertas.reduce((s, t) => s + t.valor, 0)
  const totalBaixado = baixadas.reduce((s, t) => s + t.valor, 0)
  const total = totalAberto + totalBaixado

  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="bg-gray-50">
          <th className={`text-left ${paddingLeft} py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide`}>Documento</th>
          <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Tipo</th>
          <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Lançamento</th>
          <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Vencimento</th>
          <th className="text-right px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Valor</th>
          <th className="text-center px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Status</th>
          <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Data Baixa</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        <Rows rows={abertas}  tipo="aberto" />
        <Rows rows={baixadas} tipo="baixado" />
      </tbody>
      <tfoot>
        <tr className="border-t border-gray-200 bg-gray-50">
          <td colSpan={4} className={`${paddingLeft} py-1.5 text-[11px] font-semibold text-gray-500`}>
            {hasBoth
              ? <span className="flex gap-3"><span className="text-orange-600">{formatCurrency(totalAberto)} em aberto</span><span className="text-green-600">{formatCurrency(totalBaixado)} baixado</span></span>
              : 'Total do mês'}
          </td>
          <td className="px-4 py-1.5 text-right font-mono font-bold text-gray-800 whitespace-nowrap">{formatCurrency(total)}</td>
          <td /><td />
        </tr>
      </tfoot>
    </table>
  )
}

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function fmtMes(yyyymm: string) {
  const [year, month] = yyyymm.split('-')
  return `${MESES[parseInt(month) - 1]} ${year}`
}

function anoAtual() { return new Date().getFullYear() }

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color }: {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
  color: 'blue' | 'green' | 'orange' | 'purple'
}) {
  const colors = {
    blue:   { bg: 'bg-blue-50',   icon: 'bg-blue-100 text-blue-600',   text: 'text-blue-700'   },
    green:  { bg: 'bg-green-50',  icon: 'bg-green-100 text-green-600',  text: 'text-green-700'  },
    orange: { bg: 'bg-orange-50', icon: 'bg-orange-100 text-orange-600', text: 'text-orange-700' },
    purple: { bg: 'bg-purple-50', icon: 'bg-purple-100 text-purple-600', text: 'text-purple-700' },
  }
  const c = colors[color]
  return (
    <div className={cn('rounded-xl border border-gray-200 bg-white p-3 md:p-5 shadow-sm flex items-start gap-3')}>
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', c.icon)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-gray-500 font-medium truncate">{label}</p>
        <p className="text-[16px] md:text-[22px] font-bold text-gray-900 leading-tight mt-0.5 truncate">{value}</p>
        {sub && <p className={cn('text-[10px] md:text-[11px] font-medium mt-0.5 truncate', c.text)}>{sub}</p>}
      </div>
    </div>
  )
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function ContasReceberPage() {
  const { usuario } = useAuthContext()
  const supabase = createClient()
  const role = usuario?.role as Role | undefined

  const [postos,        setPostos]        = useState<PostoOpt[]>([])
  const [resumoLinhas,  setResumoLinhas]  = useState<ResumoLinha[]>([])
  const [loadingFormas, setLoadingFormas] = useState(false)
  const [filtroFormasEmpresa,   setFiltroFormasEmpresa]   = useState('todos')
  const [filtroFormasDataIni, setFiltroFormasDataIni] = useState(`${anoAtual()}-01-01`)
  const [filtroFormasDataFim, setFiltroFormasDataFim] = useState(`${anoAtual()}-12-31`)
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'aberto' | 'baixado'>('todos')
  const [searchFormas,          setSearchFormas]          = useState('')
  const [expandidosGrupo,       setExpandidosGrupo]       = useState<Set<string>>(new Set())
  const [expandidosForma,       setExpandidosForma]       = useState<Set<string>>(new Set())
  const [expandidosPosto,       setExpandidosPosto]       = useState<Set<string>>(new Set())
  const [expandidosCliente,     setExpandidosCliente]     = useState<Set<string>>(new Set())
  const [expandidosMes,         setExpandidosMes]         = useState<Set<string>>(new Set())
  const [detalheCache,          setDetalheCache]          = useState<Record<string, Transacao[]>>({})
  const [loadingDetalhe,        setLoadingDetalhe]        = useState<Set<string>>(new Set())

  useEffect(() => {
    supabase
      .from('postos')
      .select('id, nome, codigo_empresa_externo')
      .not('codigo_empresa_externo', 'is', null)
      .order('nome')
      .then(({ data }) => { if (data) setPostos(data as PostoOpt[]) })
  }, [])

  const loadFormas = useCallback(async () => {
    setLoadingFormas(true)
    setDetalheCache({})
    setExpandidosPosto(new Set())
    setExpandidosCliente(new Set())
    setExpandidosMes(new Set())
    try {
      const params = new URLSearchParams()
      if (filtroFormasEmpresa !== 'todos') params.set('empresa', filtroFormasEmpresa)
      if (filtroFormasDataIni) params.set('data_ini', filtroFormasDataIni)
      if (filtroFormasDataFim) params.set('data_fim', filtroFormasDataFim)
      const res  = await fetch(`/api/contas-receber/formas?${params}`)
      let json: any = {}
      try { json = await res.json() } catch { /* resposta não é JSON */ }
      if (!res.ok) {
        toast({ variant: 'destructive', title: 'Erro ao carregar', description: json.error ?? `HTTP ${res.status}` })
        return
      }
      setResumoLinhas(json.resumo ?? [])
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro inesperado', description: String(err?.message ?? err) })
    } finally {
      setLoadingFormas(false)
    }
  }, [filtroFormasEmpresa, filtroFormasDataIni, filtroFormasDataFim])

  async function loadDetalhe(conta: string, mes: string, empresa?: string) {
    const key = `${conta}|${empresa ?? ''}|${mes}`
    if (detalheCache[key] !== undefined) return
    setLoadingDetalhe(prev => new Set(prev).add(key))
    try {
      const params = new URLSearchParams({ conta, mes })
      const emp = empresa ?? (filtroFormasEmpresa !== 'todos' ? filtroFormasEmpresa : undefined)
      if (emp) params.set('empresa', emp)
      const res  = await fetch(`/api/contas-receber/formas/detalhe?${params}`)
      const json = await res.json()
      if (!res.ok) { toast({ variant: 'destructive', title: 'Erro ao carregar detalhe', description: json.error }); return }
      setDetalheCache(prev => ({ ...prev, [key]: json.transacoes ?? [] }))
    } finally {
      setLoadingDetalhe(prev => { const next = new Set(prev); next.delete(key); return next })
    }
  }

  useEffect(() => { loadFormas() }, [loadFormas])

  interface MesResumo {
    mesKey: string; concluido: boolean
    totalValor: number; pagoValor: number; abertoValor: number
    qtdAbertos: number; qtdPagos: number
  }
  interface GrupoCliente {
    pessoaNome: string; meses: MesResumo[]
    totalValor: number; totalAberto: number; mesesEmAndamento: number
  }
  interface GrupoPosto {
    empresa: string; postoNome: string
    clientes: GrupoCliente[]; meses: MesResumo[]
    totalValor: number; totalAberto: number; mesesEmAndamento: number
  }
  interface GrupoForma {
    contaCodigo: string; contaNome: string; grupo: string | null; postos: GrupoPosto[]
    totalValor: number; totalAberto: number; mesesEmAndamento: number
  }

  interface GrupoPrincipal {
    grupoKey: string; grupoLabel: string
    formas: GrupoForma[]
    totalValor: number; totalAberto: number; mesesEmAndamento: number
  }

  const GRUPOS_COM_CLIENTE = new Set(['faturas', 'notas_prazo'])

  const gruposFormas = useMemo<GrupoForma[]>(() => {
    const formaMap = new Map<string, {
      contaNome: string; grupo: string | null
      postoMap: Map<string, { postoNome: string; clienteMap: Map<string, Map<string, { pago: number; pagoVal: number; aberto: number; abertoVal: number }>> }>
    }>()

    const lista = resumoLinhas
      .filter(r => searchFormas ? r.conta_nome?.toLowerCase().includes(searchFormas.toLowerCase()) : true)
      .filter(r => filtroStatus === 'todos' ? true : filtroStatus === 'aberto' ? !r.pago : r.pago)

    for (const r of lista) {
      if (!formaMap.has(r.conta_debitar))
        formaMap.set(r.conta_debitar, { contaNome: r.conta_nome ?? r.conta_debitar, grupo: r.grupo ?? null, postoMap: new Map() })
      const forma = formaMap.get(r.conta_debitar)!
      if (!forma.postoMap.has(r.empresa))
        forma.postoMap.set(r.empresa, { postoNome: r.posto_nome, clienteMap: new Map() })
      const posto = forma.postoMap.get(r.empresa)!
      const pessoaNome = r.pessoa_nome ?? '(sem cliente)'
      if (!posto.clienteMap.has(pessoaNome))
        posto.clienteMap.set(pessoaNome, new Map())
      const clienteMesMap = posto.clienteMap.get(pessoaNome)!
      if (!clienteMesMap.has(r.mes))
        clienteMesMap.set(r.mes, { pago: 0, pagoVal: 0, aberto: 0, abertoVal: 0 })
      const entry = clienteMesMap.get(r.mes)!
      if (r.pago) { entry.pago += r.qtd; entry.pagoVal += r.valor_total }
      else        { entry.aberto += r.qtd; entry.abertoVal += r.valor_total }
    }

    return Array.from(formaMap.entries())
      .map(([codigo, { contaNome, grupo, postoMap }]) => {
        const postos: GrupoPosto[] = Array.from(postoMap.entries())
          .map(([empresa, { postoNome, clienteMap }]) => {
            const clientes: GrupoCliente[] = Array.from(clienteMap.entries())
              .map(([pessoaNome, mesMap]) => {
                const meses: MesResumo[] = Array.from(mesMap.entries())
                  .map(([mesKey, e]) => ({
                    mesKey,
                    concluido:   e.aberto === 0,
                    totalValor:  e.pagoVal + e.abertoVal,
                    pagoValor:   e.pagoVal,
                    abertoValor: e.abertoVal,
                    qtdAbertos:  e.aberto,
                    qtdPagos:    e.pago,
                  }))
                  .sort((a, b) => b.mesKey.localeCompare(a.mesKey))
                return {
                  pessoaNome, meses,
                  totalValor:       meses.reduce((s, m) => s + m.totalValor, 0),
                  totalAberto:      meses.reduce((s, m) => s + m.abertoValor, 0),
                  mesesEmAndamento: meses.filter(m => !m.concluido).length,
                }
              })
              .sort((a, b) => b.mesesEmAndamento - a.mesesEmAndamento || a.pessoaNome.localeCompare(b.pessoaNome))

            // Aggregate meses across clients (for groups that don't use client-level)
            const mesAggMap = new Map<string, { pago: number; pagoVal: number; aberto: number; abertoVal: number }>()
            for (const c of clientes) {
              for (const m of c.meses) {
                if (!mesAggMap.has(m.mesKey)) mesAggMap.set(m.mesKey, { pago: 0, pagoVal: 0, aberto: 0, abertoVal: 0 })
                const agg = mesAggMap.get(m.mesKey)!
                agg.pago += m.qtdPagos; agg.pagoVal += m.pagoValor
                agg.aberto += m.qtdAbertos; agg.abertoVal += m.abertoValor
              }
            }
            const meses: MesResumo[] = Array.from(mesAggMap.entries())
              .map(([mesKey, e]) => ({
                mesKey,
                concluido:   e.aberto === 0,
                totalValor:  e.pagoVal + e.abertoVal,
                pagoValor:   e.pagoVal,
                abertoValor: e.abertoVal,
                qtdAbertos:  e.aberto,
                qtdPagos:    e.pago,
              }))
              .sort((a, b) => b.mesKey.localeCompare(a.mesKey))

            return {
              empresa, postoNome, clientes, meses,
              totalValor:       clientes.reduce((s, c) => s + c.totalValor, 0),
              totalAberto:      clientes.reduce((s, c) => s + c.totalAberto, 0),
              mesesEmAndamento: meses.filter(m => !m.concluido).length,
            }
          })
          .sort((a, b) => b.mesesEmAndamento - a.mesesEmAndamento || a.postoNome.localeCompare(b.postoNome))

        return {
          contaCodigo: codigo, contaNome, grupo,
          totalValor:       postos.reduce((s, p) => s + p.totalValor, 0),
          totalAberto:      postos.reduce((s, p) => s + p.totalAberto, 0),
          mesesEmAndamento: postos.reduce((s, p) => s + p.mesesEmAndamento, 0),
          postos,
        }
      })
      .filter(g => g.postos.length > 0)
      .sort((a, b) => b.mesesEmAndamento - a.mesesEmAndamento || a.contaNome.localeCompare(b.contaNome))
  }, [resumoLinhas, searchFormas, filtroStatus])

  // ── Agrupa formas pelos 5 grupos ──
  const gruposPrincipais = useMemo<GrupoPrincipal[]>(() => {
    const map = new Map<string, GrupoForma[]>()
    for (const g of GRUPOS_CR) map.set(g.value, [])

    for (const f of gruposFormas) {
      const key = f.grupo ?? '__sem_grupo__'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(f)
    }

    return GRUPOS_CR
      .map(g => {
        const formas = map.get(g.value) ?? []
        return {
          grupoKey:         g.value,
          grupoLabel:       g.label,
          formas,
          totalValor:       formas.reduce((s, f) => s + f.totalValor, 0),
          totalAberto:      formas.reduce((s, f) => s + f.totalAberto, 0),
          mesesEmAndamento: formas.reduce((s, f) => s + f.mesesEmAndamento, 0),
        }
      })
      .filter(g => g.formas.length > 0)
  }, [gruposFormas])

  // ── KPIs globais ──
  const kpis = useMemo(() => {
    const totalGeral   = gruposFormas.reduce((s, g) => s + g.totalValor, 0)
    const totalAberto  = gruposFormas.reduce((s, g) => s + g.totalAberto, 0)
    const totalBaixado = totalGeral - totalAberto
    const pct          = totalGeral > 0 ? Math.round((totalBaixado / totalGeral) * 100) : 0
    const formasOk     = gruposFormas.filter(g => g.mesesEmAndamento === 0).length
    const formasPend   = gruposFormas.filter(g => g.mesesEmAndamento > 0).length
    return { totalGeral, totalAberto, totalBaixado, pct, formasOk, formasPend }
  }, [gruposFormas])

  function toggleGrupo(key: string) {
    setExpandidosGrupo(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
  }
  function toggleForma(key: string) {
    setExpandidosForma(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
  }
  function togglePostoForma(key: string) {
    setExpandidosPosto(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
  }
  function toggleCliente(key: string) {
    setExpandidosCliente(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
  }
  function toggleMes(conta: string, empresa: string, mes: string) {
    const key = `${conta}|${empresa}|${mes}`
    setExpandidosMes(prev => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key) }
      else { next.add(key); loadDetalhe(conta, mes, empresa) }
      return next
    })
  }
  function toggleMesCliente(conta: string, empresa: string, pessoa: string, mes: string) {
    const expandKey = `${conta}|${empresa}|${encodeURIComponent(pessoa)}|${mes}`
    const cacheKey  = `${conta}|${empresa}|${mes}`
    setExpandidosMes(prev => {
      const next = new Set(prev)
      if (next.has(expandKey)) { next.delete(expandKey) }
      else { next.add(expandKey); loadDetalhe(conta, mes, empresa) }
      return next
    })
    void cacheKey // used via detalheCache[cacheKey] in render
  }

  if (role && !can(role, 'contas_receber.view')) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <p>Acesso restrito.</p>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="Contas a Receber"
        description="Visão consolidada dos recebíveis por forma de pagamento — AUTOSYSTEM"
        actions={
          <Button variant="outline" size="sm" disabled={loadingFormas} onClick={loadFormas} className="gap-1.5 text-[13px]">
            <RefreshCw className={cn('w-3.5 h-3.5', loadingFormas && 'animate-spin')} />
            <span className="btn-text">Atualizar</span>
          </Button>
        }
      />

      <div className="p-3 md:p-6 space-y-6">

        {/* ── KPI Cards ── */}
        {!loadingFormas && gruposFormas.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Total Geral"
              value={formatCurrency(kpis.totalGeral)}
              sub={`${gruposFormas.length} formas · ${gruposPrincipais.length} grupos`}
              icon={Wallet}
              color="blue"
            />
            <KpiCard
              label="Total Baixado"
              value={formatCurrency(kpis.totalBaixado)}
              sub={`${kpis.pct}% do total recebido`}
              icon={CheckCircle2}
              color="green"
            />
            <KpiCard
              label="Em Aberto"
              value={formatCurrency(kpis.totalAberto)}
              sub={kpis.formasPend > 0 ? `${kpis.formasPend} forma${kpis.formasPend > 1 ? 's' : ''} pendente${kpis.formasPend > 1 ? 's' : ''}` : 'Sem pendências'}
              icon={AlertCircle}
              color="orange"
            />
            <KpiCard
              label="Formas Concluídas"
              value={`${kpis.formasOk} / ${gruposFormas.length}`}
              sub={`${kpis.formasPend} em andamento`}
              icon={BarChart3}
              color="purple"
            />
          </div>
        )}

        {/* ── Barra de progresso geral ── */}
        {!loadingFormas && gruposFormas.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold text-gray-600 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-gray-400" />
                Progresso de Recebimento
              </span>
              <span className="text-[13px] font-bold text-gray-800">{kpis.pct}%</span>
            </div>
            <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-700',
                  kpis.pct === 100 ? 'bg-green-500' : kpis.pct >= 70 ? 'bg-blue-500' : 'bg-orange-500'
                )}
                style={{ width: `${kpis.pct}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[11px] text-gray-400">{formatCurrency(kpis.totalBaixado)} baixado</span>
              <span className="text-[11px] text-orange-500 font-medium">{formatCurrency(kpis.totalAberto)} em aberto</span>
            </div>
          </div>
        )}

        {/* ── Filtros ── */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[160px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <Input placeholder="Buscar forma de pagamento..." value={searchFormas} onChange={e => setSearchFormas(e.target.value)} className="pl-8 h-9 text-[13px]" />
              </div>
              <Select value={filtroFormasEmpresa} onValueChange={setFiltroFormasEmpresa}>
                <SelectTrigger className="h-9 w-full sm:w-[200px] text-[13px]"><SelectValue placeholder="Todos os postos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os postos</SelectItem>
                  {postos.map(p => <SelectItem key={p.id} value={p.codigo_empresa_externo!}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-gray-400 font-medium">Lançamento de</span>
                <Input type="date" value={filtroFormasDataIni} onChange={e => setFiltroFormasDataIni(e.target.value)} className="h-9 text-[13px] w-full" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-gray-400 font-medium">até</span>
                <Input type="date" value={filtroFormasDataFim} onChange={e => setFiltroFormasDataFim(e.target.value)} className="h-9 text-[13px] w-full" />
              </div>
            </div>
            <div className="flex gap-1.5">
              {([
                { v: 'todos',  label: 'Todos',      icon: null },
                { v: 'aberto', label: 'Em Aberto',  icon: Clock },
                { v: 'baixado',label: 'Baixado',     icon: CheckCircle2 },
              ] as const).map(({ v, label, icon: Icon }) => (
                <button
                  key={v}
                  onClick={() => setFiltroStatus(v)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors',
                    filtroStatus === v
                      ? v === 'aberto'  ? 'bg-orange-100 text-orange-700 border-orange-300'
                      : v === 'baixado' ? 'bg-green-100 text-green-700 border-green-300'
                      : 'bg-gray-100 text-gray-700 border-gray-300'
                      : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                  )}
                >
                  {Icon && <Icon className="w-3 h-3" />}
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Lista por Grupos ── */}
        {loadingFormas ? (
          <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-[13px]">Carregando dados do AUTOSYSTEM...</span>
          </div>
        ) : gruposPrincipais.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
            <CreditCard className="w-8 h-8 opacity-30" />
            <p className="text-[13px]">Nenhuma forma de pagamento encontrada.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[12px] text-gray-400">
                {gruposFormas.length} forma{gruposFormas.length !== 1 ? 's' : ''} de pagamento em {gruposPrincipais.length} grupo{gruposPrincipais.length !== 1 ? 's' : ''}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setExpandidosGrupo(new Set(gruposPrincipais.map(g => g.grupoKey)))} className="text-[12px] text-gray-500 hover:text-gray-700 flex items-center gap-1">
                  <ChevronsUpDown className="w-3.5 h-3.5" /> Expandir todos
                </button>
                <span className="text-gray-300">|</span>
                <button onClick={() => { setExpandidosGrupo(new Set()); setExpandidosForma(new Set()); setExpandidosMes(new Set()) }} className="text-[12px] text-gray-500 hover:text-gray-700">Recolher todos</button>
              </div>
            </div>

            {gruposPrincipais.map(grupo => {
              const gcfg        = GRUPOS_CR.find(g => g.value === grupo.grupoKey)!
              const GrupoIcon   = gcfg?.icon ?? Tag
              const grupoExpanded = expandidosGrupo.has(grupo.grupoKey)
              const pctGrupo    = grupo.totalValor > 0
                ? Math.round(((grupo.totalValor - grupo.totalAberto) / grupo.totalValor) * 100) : 100

              return (
                <div key={grupo.grupoKey} className={cn('rounded-xl border-2 overflow-hidden shadow-sm', gcfg?.border ?? 'border-gray-200')}>
                  {/* Cabeçalho do grupo */}
                  <button
                    className={cn('w-full flex items-center justify-between px-5 py-4 text-left transition-colors hover:brightness-95', gcfg?.header ?? 'bg-gray-50')}
                    onClick={() => toggleGrupo(grupo.grupoKey)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', gcfg?.badge ?? 'bg-gray-100 text-gray-600')}>
                        <GrupoIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[14px] text-gray-800">{grupo.grupoLabel}</span>
                          <span className="text-[11px] text-gray-500">{grupo.formas.length} forma{grupo.formas.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <div className="w-24 h-1.5 bg-white/60 rounded-full overflow-hidden">
                            <div className={cn('h-full rounded-full', pctGrupo === 100 ? 'bg-green-500' : 'bg-orange-400')} style={{ width: `${pctGrupo}%` }} />
                          </div>
                          <span className="text-[11px] text-gray-600 font-semibold">{formatCurrency(grupo.totalValor)}</span>
                          {grupo.totalAberto > 0 && (
                            <span className="text-[11px] text-orange-600 font-medium">{formatCurrency(grupo.totalAberto)} em aberto</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {grupo.mesesEmAndamento > 0
                        ? <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 border border-orange-200 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {grupo.mesesEmAndamento} pendente{grupo.mesesEmAndamento !== 1 ? 's' : ''}
                          </span>
                        : <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700 border border-green-200 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Concluído
                          </span>
                      }
                      <ChevronDown className={cn('w-4 h-4 text-gray-500 transition-transform', grupoExpanded && 'rotate-180')} />
                    </div>
                  </button>

                  {/* Formas dentro do grupo */}
                  {grupoExpanded && (
                    <div className="bg-white divide-y divide-gray-100">
                      {grupo.formas.map(forma => {
              const formaExpanded = expandidosForma.has(forma.contaCodigo)
              const pctForma = forma.totalValor > 0
                ? Math.round(((forma.totalValor - forma.totalAberto) / forma.totalValor) * 100)
                : 100

              const usaCliente = GRUPOS_COM_CLIENTE.has(forma.grupo ?? '')
              return (
                <div key={forma.contaCodigo} className={cn(
                  'rounded-xl border bg-white overflow-hidden shadow-sm',
                  forma.mesesEmAndamento > 0 ? 'border-orange-200' : 'border-green-200',
                )}>
                  {/* Nível 1: Forma de Pagamento */}
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                    onClick={() => toggleForma(forma.contaCodigo)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', forma.mesesEmAndamento > 0 ? 'bg-orange-100' : 'bg-green-100')}>
                        <CreditCard className={cn('w-4 h-4', forma.mesesEmAndamento > 0 ? 'text-orange-600' : 'text-green-600')} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-[13px] text-gray-800">{forma.contaNome}</span>
                          <span className="text-[11px] text-gray-400">{forma.postos.length} posto{forma.postos.length !== 1 ? 's' : ''}</span>
                        </div>
                        {/* Mini progress bar por forma */}
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 max-w-[120px] h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={cn('h-full rounded-full', pctForma === 100 ? 'bg-green-500' : 'bg-orange-400')}
                              style={{ width: `${pctForma}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-gray-400">{pctForma}% · {formatCurrency(forma.totalValor)}</span>
                          {forma.totalAberto > 0 && (
                            <span className="text-[11px] text-orange-500 font-medium">· {formatCurrency(forma.totalAberto)} em aberto</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      {forma.mesesEmAndamento > 0
                        ? <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-700 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {forma.mesesEmAndamento} {forma.mesesEmAndamento === 1 ? 'mês' : 'meses'} pendente{forma.mesesEmAndamento !== 1 ? 's' : ''}
                          </span>
                        : <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Concluído
                          </span>
                      }
                      <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 transition-transform', formaExpanded && 'rotate-180')} />
                    </div>
                  </button>

                  {/* Nível 2: Postos */}
                  {formaExpanded && (
                    <div className="divide-y divide-gray-100">
                      {forma.postos.map(posto => {
                        const postoKey      = `${forma.contaCodigo}|${posto.empresa}`
                        const postoExpanded = expandidosPosto.has(postoKey)

                        return (
                          <div key={posto.empresa}>
                            <button
                              className="w-full flex items-center justify-between px-5 py-2.5 bg-white hover:bg-gray-50 transition-colors text-left"
                              onClick={() => togglePostoForma(postoKey)}
                            >
                              <div className="flex items-center gap-2.5">
                                <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                <span className="text-[13px] font-semibold text-gray-700">{posto.postoNome}</span>
                                <span className="text-[11px] text-gray-400">
                                  {posto.meses.length} {posto.meses.length === 1 ? 'mês' : 'meses'} · {formatCurrency(posto.totalValor)}
                                  {posto.totalAberto > 0 && <> · <span className="text-orange-500">{formatCurrency(posto.totalAberto)} em aberto</span></>}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {posto.mesesEmAndamento > 0
                                  ? <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 flex items-center gap-1">
                                      <Clock className="w-3 h-3" /> {posto.mesesEmAndamento} em andamento
                                    </span>
                                  : <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" /> Concluído
                                    </span>
                                }
                                <ChevronDown className={cn('w-3 h-3 text-gray-400 transition-transform', postoExpanded && 'rotate-180')} />
                              </div>
                            </button>

                            {/* Nível 3: Clientes (faturas/notas_prazo) ou Meses direto */}
                            {postoExpanded && (
                              usaCliente ? (
                                /* ── Com nível de cliente ── */
                                <div className="divide-y divide-gray-50 bg-gray-50/30">
                                  {posto.clientes.map(cliente => {
                                    const clienteKey     = `${forma.contaCodigo}|${posto.empresa}|${encodeURIComponent(cliente.pessoaNome)}`
                                    const clienteExpanded = expandidosCliente.has(clienteKey)
                                    return (
                                      <div key={cliente.pessoaNome}>
                                        <button
                                          className="w-full flex items-center justify-between px-8 py-2 hover:bg-gray-100/60 transition-colors text-left"
                                          onClick={() => toggleCliente(clienteKey)}
                                        >
                                          <div className="flex items-center gap-2.5">
                                            <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                            <span className="text-[12px] font-semibold text-gray-700">{cliente.pessoaNome}</span>
                                            <span className="text-[11px] text-gray-400">
                                              {cliente.meses.length} {cliente.meses.length === 1 ? 'mês' : 'meses'} · {formatCurrency(cliente.totalValor)}
                                              {cliente.totalAberto > 0 && <> · <span className="text-orange-500">{formatCurrency(cliente.totalAberto)} em aberto</span></>}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            {cliente.mesesEmAndamento > 0
                                              ? <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 flex items-center gap-1">
                                                  <Clock className="w-3 h-3" /> {cliente.mesesEmAndamento} em andamento
                                                </span>
                                              : <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex items-center gap-1">
                                                  <CheckCircle2 className="w-3 h-3" /> Concluído
                                                </span>
                                            }
                                            <ChevronDown className={cn('w-3 h-3 text-gray-400 transition-transform', clienteExpanded && 'rotate-180')} />
                                          </div>
                                        </button>

                                        {/* Meses do cliente */}
                                        {clienteExpanded && (
                                          <div className="divide-y divide-gray-50 bg-gray-50/40">
                                            {cliente.meses.map(mes => {
                                              const expandKey   = `${forma.contaCodigo}|${posto.empresa}|${encodeURIComponent(cliente.pessoaNome)}|${mes.mesKey}`
                                              const cacheKey    = `${forma.contaCodigo}|${posto.empresa}|${mes.mesKey}`
                                              const mesExpanded = expandidosMes.has(expandKey)
                                              const allTrans    = detalheCache[cacheKey]
                                              const transacoes  = allTrans?.filter(t => (t.pessoa_nome ?? '(sem cliente)') === cliente.pessoaNome)
                                              const carregando  = loadingDetalhe.has(cacheKey)
                                              const totalTrans  = mes.qtdPagos + mes.qtdAbertos
                                              const pctMes      = mes.totalValor > 0 ? Math.round((mes.pagoValor / mes.totalValor) * 100) : 100

                                              return (
                                                <div key={mes.mesKey} className={cn(!mes.concluido && 'bg-orange-50/20')}>
                                                  <button
                                                    className="w-full flex items-center justify-between px-12 py-2.5 hover:bg-gray-100/60 transition-colors text-left"
                                                    onClick={() => toggleMesCliente(forma.contaCodigo, posto.empresa, cliente.pessoaNome, mes.mesKey)}
                                                  >
                                                    <div className="flex items-center gap-3">
                                                      <CalendarDays className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                                      <span className="text-[12px] font-semibold text-gray-700 w-28">{fmtMes(mes.mesKey)}</span>
                                                      <span className="text-[11px] text-gray-400">{totalTrans} transaç{totalTrans !== 1 ? 'ões' : 'ão'}</span>
                                                      <div className="hidden sm:flex items-center gap-1.5">
                                                        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                          <div className={cn('h-full rounded-full', mes.concluido ? 'bg-green-500' : 'bg-orange-400')} style={{ width: `${pctMes}%` }} />
                                                        </div>
                                                        <span className="text-[10px] text-gray-400">{pctMes}%</span>
                                                      </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                      {mes.concluido
                                                        ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200"><CheckCircle2 className="w-3 h-3" /> Concluído</span>
                                                        : <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200"><Clock className="w-3 h-3" /> Em Andamento</span>
                                                      }
                                                      <span className="text-[12px] font-semibold text-gray-700 w-24 text-right">{formatCurrency(mes.totalValor)}</span>
                                                      {mes.qtdAbertos > 0 && <span className="text-[11px] text-orange-500 font-medium hidden md:inline">{mes.qtdAbertos} em aberto</span>}
                                                      <ChevronDown className={cn('w-3 h-3 text-gray-400 transition-transform', mesExpanded && 'rotate-180')} />
                                                    </div>
                                                  </button>
                                                  {mesExpanded && (
                                                    <div className="overflow-x-auto border-t border-gray-100">
                                                      {carregando ? (
                                                        <div className="flex items-center justify-center py-5 gap-2 text-gray-400 text-[12px]">
                                                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Carregando transações...
                                                        </div>
                                                      ) : (
                                                        <TabelaTransacoes transacoes={transacoes ?? []} paddingLeft="px-12" />
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
                              ) : (
                                /* ── Sem nível de cliente: direto nos meses ── */
                                <div className="divide-y divide-gray-50 bg-gray-50/30">
                                  {posto.meses.map(mes => {
                                    const mesKey     = `${forma.contaCodigo}|${posto.empresa}|${mes.mesKey}`
                                    const mesExpanded = expandidosMes.has(mesKey)
                                    const transacoes  = detalheCache[mesKey]
                                    const carregando  = loadingDetalhe.has(mesKey)
                                    const totalTrans  = mes.qtdPagos + mes.qtdAbertos
                                    const pctMes      = mes.totalValor > 0 ? Math.round((mes.pagoValor / mes.totalValor) * 100) : 100

                                    return (
                                      <div key={mes.mesKey} className={cn(!mes.concluido && 'bg-orange-50/20')}>
                                        <button
                                          className="w-full flex items-center justify-between px-8 py-2.5 hover:bg-gray-100/60 transition-colors text-left"
                                          onClick={() => toggleMes(forma.contaCodigo, posto.empresa, mes.mesKey)}
                                        >
                                          <div className="flex items-center gap-3">
                                            <CalendarDays className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                            <span className="text-[12px] font-semibold text-gray-700 w-28">{fmtMes(mes.mesKey)}</span>
                                            <span className="text-[11px] text-gray-400">{totalTrans} transaç{totalTrans !== 1 ? 'ões' : 'ão'}</span>
                                            <div className="hidden sm:flex items-center gap-1.5">
                                              <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                <div className={cn('h-full rounded-full', mes.concluido ? 'bg-green-500' : 'bg-orange-400')} style={{ width: `${pctMes}%` }} />
                                              </div>
                                              <span className="text-[10px] text-gray-400">{pctMes}%</span>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            {mes.concluido
                                              ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200"><CheckCircle2 className="w-3 h-3" /> Concluído</span>
                                              : <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200"><Clock className="w-3 h-3" /> Em Andamento</span>
                                            }
                                            <span className="text-[12px] font-semibold text-gray-700 w-24 text-right">{formatCurrency(mes.totalValor)}</span>
                                            {mes.qtdAbertos > 0 && <span className="text-[11px] text-orange-500 font-medium hidden md:inline">{mes.qtdAbertos} em aberto</span>}
                                            <ChevronDown className={cn('w-3 h-3 text-gray-400 transition-transform', mesExpanded && 'rotate-180')} />
                                          </div>
                                        </button>

                                        {mesExpanded && (
                                          <div className="overflow-x-auto border-t border-gray-100">
                                            {carregando ? (
                                              <div className="flex items-center justify-center py-5 gap-2 text-gray-400 text-[12px]">
                                                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Carregando transações...
                                              </div>
                                            ) : (
                                              <TabelaTransacoes transacoes={transacoes ?? []} paddingLeft="px-8" />
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              )
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
