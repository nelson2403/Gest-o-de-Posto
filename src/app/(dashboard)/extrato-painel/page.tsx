'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { useAuthContext } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils/cn'
import { formatCurrency } from '@/lib/utils/formatters'
import {
  CheckCircle2, AlertTriangle, Clock, RefreshCw, ScanSearch,
  FileSpreadsheet, TrendingUp, TrendingDown, Minus, Search, Download,
  ShieldAlert, X, ShieldCheck,
} from 'lucide-react'
import type { Role } from '@/types/database.types'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ExtratoRow {
  id: string
  titulo: string
  status: string
  data_inicio: string | null
  extrato_arquivo_path: string | null
  extrato_arquivo_nome: string | null
  extrato_data: string | null
  extrato_periodo_ini: string | null
  extrato_saldo_dia: number | null
  extrato_saldo_anterior: number | null
  extrato_movimento: number | null
  extrato_saldo_externo: number | null
  extrato_diferenca: number | null
  extrato_status: 'ok' | 'divergente' | null
  extrato_validado_em: string | null
  posto: { nome: string } | null
  usuario: { nome: string } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtData(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso + (iso.includes('T') ? '' : 'T12:00:00')).toLocaleDateString('pt-BR')
}

function fmtDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtMov(val: number | null) {
  if (val === null) return '—'
  const prefix = val > 0 ? '+' : ''
  return prefix + formatCurrency(val)
}

// ─── Componentes auxiliares ───────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'ok' | 'divergente' | null }) {
  if (!status) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500 border border-gray-200">
      <Clock className="w-3 h-3" /> Pendente
    </span>
  )
  if (status === 'ok') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-100 text-green-700 border border-green-200">
      <CheckCircle2 className="w-3 h-3" /> OK
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-100 text-red-700 border border-red-200">
      <AlertTriangle className="w-3 h-3" /> Divergente
    </span>
  )
}

function DifBadge({ dif }: { dif: number | null }) {
  if (dif === null) return <span className="text-gray-400 text-[12px]">—</span>
  if (Math.abs(dif) < 0.02) return (
    <span className="flex items-center gap-1 text-green-600 text-[12px] font-mono font-medium">
      <Minus className="w-3 h-3" /> 0,00
    </span>
  )
  const Icon = dif > 0 ? TrendingUp : TrendingDown
  return (
    <span className={cn('flex items-center gap-1 text-[12px] font-mono font-semibold', dif > 0 ? 'text-orange-600' : 'text-red-600')}>
      <Icon className="w-3 h-3" />
      {dif > 0 ? '+' : ''}{formatCurrency(dif)}
    </span>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function ExtratoPainelPage() {
  const { usuario } = useAuthContext()
  const supabase = createClient()
  const role = usuario?.role as Role | undefined

  const [rows, setRows] = useState<ExtratoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'ok' | 'divergente' | 'pendente'>('todos')
  const [filtroPosto, setFiltroPosto] = useState('todos')

  // ── Verificação de divergências ────────────────────────────────────────────
  interface DivergenciaAlerta {
    id: string; titulo: string; postoNome: string; data: string
    movExtrato: number; movAnterior: number; movAtual: number; diferenca: number
  }
  const [verificando,  setVerificando]  = useState(false)
  const [alertas,      setAlertas]      = useState<DivergenciaAlerta[]>([])
  const [verificadoEm, setVerificadoEm] = useState<Date | null>(null)
  const [aceitando,    setAceitando]    = useState(false)

  async function aceitarTodas() {
    if (!alertas.length) return
    setAceitando(true)
    try {
      const res  = await fetch('/api/extrato-verificar/aceitar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: alertas.map(a => a.id) }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ variant: 'destructive', title: 'Erro ao confirmar', description: json.error })
        return
      }
      toast({ title: `✅ ${json.aceitas} divergência${json.aceitas !== 1 ? 's' : ''} confirmada${json.aceitas !== 1 ? 's' : ''} como correta${json.aceitas !== 1 ? 's' : ''}` })
      setAlertas([])
      await load()
    } finally {
      setAceitando(false)
    }
  }

  async function verificarDivergencias() {
    setVerificando(true)
    try {
      const res  = await fetch('/api/extrato-verificar', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        toast({ variant: 'destructive', title: 'Erro ao verificar', description: json.error })
        return
      }
      setAlertas(json.divergentes ?? [])
      setVerificadoEm(new Date())
      await load() // recarrega tabela para refletir os novos status
      if (json.divergentes?.length > 0) {
        const resMsg = json.resolvidos > 0 ? ` · ${json.resolvidos} resolvida${json.resolvidos > 1 ? 's' : ''}` : ''
        toast({
          variant: 'destructive',
          title: `⚠️ ${json.divergentes.length} divergência${json.divergentes.length > 1 ? 's' : ''} detectada${json.divergentes.length > 1 ? 's' : ''}${resMsg}`,
          description: 'O AUTOSYSTEM foi alterado após a validação do extrato.',
        })
      } else if (json.resolvidos > 0) {
        toast({ title: `✅ ${json.resolvidos} divergência${json.resolvidos > 1 ? 's' : ''} resolvida${json.resolvidos > 1 ? 's' : ''} — AUTOSYSTEM voltou a bater com o extrato.` })
      } else {
        toast({ title: `✅ Tudo OK — ${json.verificadas} extrato${json.verificadas !== 1 ? 's' : ''} verificado${json.verificadas !== 1 ? 's' : ''}` })
      }
    } finally {
      setVerificando(false)
    }
  }

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('tarefas')
      .select(`
        id, titulo, status, data_inicio,
        extrato_arquivo_path, extrato_arquivo_nome, extrato_data, extrato_periodo_ini,
        extrato_saldo_dia, extrato_saldo_anterior,
        extrato_movimento, extrato_saldo_externo,
        extrato_diferenca, extrato_status, extrato_validado_em,
        posto:postos(nome),
        usuario:usuarios(nome)
      `)
      .eq('categoria', 'conciliacao_bancaria')
      .order('extrato_validado_em', { ascending: false, nullsFirst: false })
      .order('data_inicio', { ascending: false })
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao carregar dados', description: error.message })
    } else {
      setRows((data ?? []) as unknown as ExtratoRow[])
    }
    setLoading(false)
  }

  async function handleDownload(row: ExtratoRow) {
    if (!row.extrato_arquivo_path) return
    setDownloading(row.id)
    const { data, error } = await supabase.storage
      .from('extratos-bancarios')
      .createSignedUrl(row.extrato_arquivo_path, 60)
    if (error || !data?.signedUrl) {
      toast({ variant: 'destructive', title: 'Erro ao gerar link de download' })
    } else {
      const a = document.createElement('a')
      a.href = data.signedUrl
      a.download = row.extrato_arquivo_nome ?? 'extrato.xlsx'
      a.click()
    }
    setDownloading(null)
  }

  useEffect(() => { load() }, [])

  // ── Postos únicos para o filtro ────────────────────────────────────────────
  const postosUnicos = useMemo(() => {
    const nomes = [...new Set(rows.map(r => r.posto?.nome).filter(Boolean) as string[])]
    return nomes.sort()
  }, [rows])

  // ── Filtragem ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filtroStatus !== 'todos') {
        if (filtroStatus === 'pendente' && r.extrato_status !== null) return false
        if (filtroStatus === 'ok'        && r.extrato_status !== 'ok') return false
        if (filtroStatus === 'divergente' && r.extrato_status !== 'divergente') return false
      }
      if (filtroPosto !== 'todos' && r.posto?.nome !== filtroPosto) return false
      if (search) {
        const q = search.toLowerCase()
        const inPosto   = r.posto?.nome?.toLowerCase().includes(q) ?? false
        const inTitulo  = r.titulo.toLowerCase().includes(q)
        const inArquivo = r.extrato_arquivo_nome?.toLowerCase().includes(q) ?? false
        if (!inPosto && !inTitulo && !inArquivo) return false
      }
      return true
    })
  }, [rows, filtroStatus, filtroPosto, search])

  // ── Resumo ─────────────────────────────────────────────────────────────────
  const resumo = useMemo(() => ({
    total:       rows.length,
    ok:          rows.filter(r => r.extrato_status === 'ok').length,
    divergente:  rows.filter(r => r.extrato_status === 'divergente').length,
    pendente:    rows.filter(r => r.extrato_status === null).length,
  }), [rows])

  return (
    <div className="animate-fade-in">
      <Header
        title="Painel de Extrato"
        description="Monitoramento do cruzamento de dados entre extratos bancários e AUTOSYSTEM"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              onClick={verificarDivergencias}
              disabled={verificando || loading}
              className="gap-1.5 text-[13px] border-orange-300 text-orange-700 hover:bg-orange-50"
              title="Verifica se o AUTOSYSTEM foi alterado após a validação dos extratos"
            >
              <ShieldAlert className={cn('w-3.5 h-3.5', verificando && 'animate-pulse')} />
              {verificando ? 'Verificando...' : 'Verificar Divergências'}
            </Button>
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5 text-[13px]">
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
              Atualizar
            </Button>
          </div>
        }
      />

      <div className="p-3 md:p-6 space-y-5">

        {/* ── Cards de resumo ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: resumo.total, color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200', onClick: () => setFiltroStatus('todos') },
            { label: 'Validados', value: resumo.ok, color: 'text-green-700', bg: 'bg-green-50 border-green-200', onClick: () => setFiltroStatus('ok') },
            { label: 'Divergentes', value: resumo.divergente, color: 'text-red-700', bg: 'bg-red-50 border-red-200', onClick: () => setFiltroStatus('divergente') },
            { label: 'Pendentes', value: resumo.pendente, color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200', onClick: () => setFiltroStatus('pendente') },
          ].map(c => (
            <button
              key={c.label}
              onClick={c.onClick}
              className={cn('rounded-xl border p-4 text-left hover:opacity-80 transition-opacity', c.bg)}
            >
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{c.label}</p>
              <p className={cn('text-2xl font-bold', c.color)}>{c.value}</p>
            </button>
          ))}
        </div>

        {/* ── Painel de alertas de divergência ────────────────────────── */}
        {alertas.length > 0 && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-4 space-y-3">
            <div className="flex flex-wrap items-start gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span className="font-semibold text-[13px] text-red-700">
                  {alertas.length} extrato{alertas.length !== 1 ? 's' : ''} divergiu após a validação — AUTOSYSTEM alterado
                </span>
                {verificadoEm && (
                  <span className="text-[11px] text-red-400 whitespace-nowrap">
                    Verificado às {verificadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  onClick={aceitarTodas}
                  disabled={aceitando}
                  className="h-7 px-3 text-[11px] gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                >
                  {aceitando
                    ? <RefreshCw className="w-3 h-3 animate-spin" />
                    : <ShieldCheck className="w-3 h-3" />}
                  Confirmar todas como corretas
                </Button>
                <button onClick={() => setAlertas([])} className="text-red-400 hover:text-red-600 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {alertas.map(a => (
                <div key={a.id} className="bg-white rounded-lg border border-red-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-semibold text-gray-800">{a.postoNome}</p>
                    <p className="text-[11px] text-gray-500">{a.titulo} · Data: {new Date(a.data + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[12px]">
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">Extrato</p>
                      <p className="font-mono font-semibold text-gray-700">{a.movExtrato >= 0 ? '+' : ''}{formatCurrency(a.movExtrato)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">AS anterior</p>
                      <p className="font-mono font-semibold text-green-700">{a.movAnterior >= 0 ? '+' : ''}{formatCurrency(a.movAnterior)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">AS atual</p>
                      <p className="font-mono font-semibold text-red-600">{a.movAtual >= 0 ? '+' : ''}{formatCurrency(a.movAtual)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">Diferença</p>
                      <p className={cn('font-mono font-bold', Math.abs(a.diferenca) < 0.02 ? 'text-green-600' : 'text-red-600')}>
                        {a.diferenca >= 0 ? '+' : ''}{formatCurrency(a.diferenca)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sem alertas após verificação ── */}
        {alertas.length === 0 && verificadoEm && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span className="text-[13px] text-green-700 font-medium">
              Todos os extratos validados estão consistentes com o AUTOSYSTEM.
            </span>
            <span className="text-[11px] text-green-500 ml-1">
              Verificado às {verificadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}

        {/* ── Filtros ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <Input
              placeholder="Buscar posto, título ou arquivo..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 text-[13px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={filtroStatus} onValueChange={v => setFiltroStatus(v as typeof filtroStatus)}>
              <SelectTrigger className="h-9 w-full text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="ok">Validados</SelectItem>
                <SelectItem value="divergente">Divergentes</SelectItem>
                <SelectItem value="pendente">Pendentes</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroPosto} onValueChange={setFiltroPosto}>
              <SelectTrigger className="h-9 w-full text-[13px]">
                <SelectValue placeholder="Todos os postos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os postos</SelectItem>
                {postosUnicos.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Tabela ──────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
              <ScanSearch className="w-8 h-8 opacity-30" />
              <p className="text-[13px]">Nenhuma tarefa encontrada com os filtros aplicados.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Posto</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Conciliador</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Data Extrato</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Saldo Anterior</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Saldo do Dia</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Mov. Extrato</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Mov. AUTOSYSTEM</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Diferença</th>
                    <th className="text-center px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Validado em</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(r => (
                    <tr
                      key={r.id}
                      className={cn(
                        'hover:bg-gray-50/60 transition-colors',
                        r.extrato_status === 'divergente' && 'bg-red-50/40 hover:bg-red-50/60',
                      )}
                    >
                      {/* Posto */}
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{r.posto?.nome ?? '—'}</p>
                        {r.extrato_arquivo_nome && (
                          <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                            <FileSpreadsheet className="w-3 h-3" />
                            {r.extrato_arquivo_nome}
                          </p>
                        )}
                      </td>

                      {/* Conciliador */}
                      <td className="px-4 py-3 text-gray-600">{r.usuario?.nome ?? '—'}</td>

                      {/* Data extrato */}
                      <td className="px-4 py-3 text-gray-600 font-mono text-[12px] whitespace-nowrap">
                        {r.extrato_periodo_ini && r.extrato_periodo_ini !== r.extrato_data
                          ? <span title={`Extrato multi-dias: ${fmtData(r.extrato_periodo_ini)} a ${fmtData(r.extrato_data)}`}>
                              {fmtData(r.extrato_periodo_ini)} a {fmtData(r.extrato_data)}
                            </span>
                          : fmtData(r.extrato_data)
                        }
                      </td>

                      {/* Saldo anterior */}
                      <td className="px-4 py-3 text-right font-mono text-[12px] text-gray-600">
                        {r.extrato_saldo_anterior !== null ? formatCurrency(r.extrato_saldo_anterior) : '—'}
                      </td>

                      {/* Saldo do dia */}
                      <td className="px-4 py-3 text-right font-mono text-[12px] text-gray-700 font-medium">
                        {r.extrato_saldo_dia !== null ? formatCurrency(r.extrato_saldo_dia) : '—'}
                      </td>

                      {/* Movimento extrato */}
                      <td className="px-4 py-3 text-right">
                        <span className={cn(
                          'font-mono text-[12px] font-medium',
                          r.extrato_movimento !== null && r.extrato_movimento >= 0 ? 'text-green-700' : 'text-red-600',
                        )}>
                          {fmtMov(r.extrato_movimento)}
                        </span>
                      </td>

                      {/* Movimento AUTOSYSTEM */}
                      <td className="px-4 py-3 text-right">
                        <span className={cn(
                          'font-mono text-[12px] font-medium',
                          r.extrato_saldo_externo !== null && r.extrato_saldo_externo >= 0 ? 'text-green-700' : 'text-red-600',
                        )}>
                          {fmtMov(r.extrato_saldo_externo)}
                        </span>
                      </td>

                      {/* Diferença */}
                      <td className="px-4 py-3 text-right">
                        <DifBadge dif={r.extrato_diferenca} />
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={r.extrato_status} />
                      </td>

                      {/* Validado em */}
                      <td className="px-4 py-3 text-[11px] text-gray-400">
                        {fmtDateTime(r.extrato_validado_em)}
                      </td>

                      {/* Download */}
                      <td className="px-4 py-3">
                        {r.extrato_arquivo_path ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                            onClick={() => handleDownload(r)}
                            disabled={downloading === r.id}
                            title="Baixar extrato"
                          >
                            {downloading === r.id
                              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              : <Download className="w-3.5 h-3.5" />
                            }
                          </Button>
                        ) : (
                          <span className="text-gray-300 text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {filtered.length > 0 && (
          <p className="text-[11px] text-gray-400 text-right">
            Exibindo {filtered.length} de {rows.length} registros
          </p>
        )}
      </div>
    </div>
  )
}
