'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils/cn'
import {
  Megaphone, Gift, Link2, AlertTriangle, CheckCircle2,
  Clock, TrendingUp, ChevronRight, Loader2, RefreshCw,
  Send, Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthContext } from '@/contexts/AuthContext'

// ── Solicitação de Pagamento para Contas a Pagar ───────────────
interface Solicitacao {
  id: string; titulo: string; fornecedor: string | null; valor: number | null
  data_vencimento: string | null; status: string; criado_em: string
}
const STATUS_COLOR_SOL: Record<string, string> = {
  pendente: 'bg-yellow-100 text-yellow-700', em_analise: 'bg-blue-100 text-blue-700',
  aprovado: 'bg-emerald-100 text-emerald-700', pago: 'bg-green-100 text-green-700',
  rejeitado: 'bg-red-100 text-red-700',
}
const STATUS_LABEL_SOL: Record<string, string> = {
  pendente: 'Pendente', em_analise: 'Em Análise', aprovado: 'Aprovado', pago: 'Pago', rejeitado: 'Rejeitado',
}
function fmtBRLSol(v: number | null) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDateSol(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

function SolicitacoesPagamentoMarketing() {
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([])
  const [loading, setLoading]           = useState(true)
  const [showNova, setShowNova]         = useState(false)
  const [saving, setSaving]             = useState(false)
  const [form, setForm] = useState({ titulo: '', fornecedor: '', valor: '', data_vencimento: '', descricao: '' })

  async function carregar() {
    setLoading(true)
    const r = await fetch('/api/solicitacoes-pagamento?setor=marketing')
    const json = await r.json()
    setSolicitacoes(json.solicitacoes ?? [])
    setLoading(false)
  }
  useEffect(() => { carregar() }, [])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!form.titulo.trim()) { toast({ variant: 'destructive', title: 'Informe o título' }); return }
    setSaving(true)
    const r = await fetch('/api/solicitacoes-pagamento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, setor: 'marketing', valor: form.valor ? Number(form.valor.replace(',', '.')) : null }),
    })
    if (r.ok) {
      toast({ title: 'Solicitação enviada para Contas a Pagar!' })
      setForm({ titulo: '', fornecedor: '', valor: '', data_vencimento: '', descricao: '' })
      setShowNova(false); carregar()
    } else { toast({ variant: 'destructive', title: 'Erro ao enviar' }) }
    setSaving(false)
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-blue-500" />
          <span className="font-semibold text-gray-800 text-[13px]">Enviar para Contas a Pagar</span>
          <span className="text-[11px] text-gray-400">({solicitacoes.length})</span>
        </div>
        <button onClick={() => setShowNova(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-[12px] font-medium rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" /> Nova Solicitação
        </button>
      </div>
      {showNova && (
        <form onSubmit={enviar} className="p-4 border-b border-gray-100 space-y-3 bg-blue-50/40">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Título *</label>
              <input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} required
                placeholder="Ex: Patrocínio evento XYZ"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Fornecedor / Beneficiário</label>
              <input value={form.fornecedor} onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))}
                placeholder="Nome"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Valor (R$)</label>
              <input value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                placeholder="0,00"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Vencimento</label>
              <input value={form.data_vencimento} onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))}
                type="date"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Observações</label>
              <input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder="Informações adicionais"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-[13px] font-medium rounded-lg disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {saving ? 'Enviando...' : 'Enviar'}
            </button>
            <button type="button" onClick={() => setShowNova(false)}
              className="px-4 py-2 text-gray-500 text-[13px] rounded-lg hover:bg-gray-100">Cancelar</button>
          </div>
        </form>
      )}
      {loading ? (
        <div className="p-6 text-center text-[13px] text-gray-400">Carregando...</div>
      ) : solicitacoes.length === 0 ? (
        <div className="p-6 text-center text-[13px] text-gray-400">Nenhuma solicitação enviada</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {solicitacoes.map(s => (
            <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-gray-800 truncate">{s.titulo}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {s.fornecedor ? `${s.fornecedor} · ` : ''}{fmtBRLSol(s.valor)}{s.data_vencimento ? ` · ${fmtDateSol(s.data_vencimento)}` : ''}
                </p>
              </div>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLOR_SOL[s.status] ?? 'bg-gray-100 text-gray-500'}`}>
                {STATUS_LABEL_SOL[s.status] ?? s.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Saldo {
  posto_id: string
  posto_nome: string
  limite_mensal: number
  limite_anual: number
  gasto_mensal_patrocinio: number
  gasto_anual_patrocinio: number
  gasto_mensal_acoes: number
}

interface Patrocinio {
  id: string
  posto_id: string
  valor: number
  data_evento: string
  patrocinado: string
  status: 'pendente' | 'aprovado' | 'reprovado'
  postos: { nome: string }
}

interface Acao {
  id: string
  titulo: string
  data_acao: string
  prazo_envio: string
  status: string
  valor_padrao: number
  marketing_acao_postos: { id: string; status: string }[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function ProgressBar({ pct, className }: { pct: number; className?: string }) {
  const cor = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-orange-400' : 'bg-emerald-500'
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
      <div className={cn('h-full rounded-full transition-all', cor, className)} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string
  icon: React.ElementType; color: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-start gap-3">
      <div className={cn('p-2 rounded-lg', color)}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-gray-500 uppercase tracking-wide font-medium">{label}</p>
        <p className="text-base md:text-xl font-bold text-gray-800 mt-0.5 truncate">{value}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function MarketingDashboard() {
  const { usuario } = useAuthContext()
  const router      = useRouter()
  const isGerente   = usuario?.role === 'gerente'
  const postoFixoId = usuario?.posto_fechamento_id ?? null

  useEffect(() => {
    if (isGerente) router.replace('/marketing/patrocinio')
  }, [isGerente, router])

  const [saldos, setSaldos]           = useState<Saldo[]>([])
  const [patrocinios, setPatrocinios] = useState<Patrocinio[]>([])
  const [acoes, setAcoes]             = useState<Acao[]>([])
  const [loading, setLoading]         = useState(true)

  async function load() {
    setLoading(true)
    try {
      const [rSaldo, rPat, rAcao] = await Promise.all([
        fetch('/api/marketing/saldo'),
        fetch('/api/marketing/patrocinios'),
        fetch('/api/marketing/acoes?status=aberta'),
      ])
      const [dSaldo, dPat, dAcao] = await Promise.all([rSaldo.json(), rPat.json(), rAcao.json()])
      setSaldos(dSaldo.saldo ?? [])
      setPatrocinios(dPat.patrocinios ?? [])
      setAcoes(dAcao.acoes ?? [])
    } catch {
      toast({ title: 'Erro ao carregar dados', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // KPIs
  const kpis = useMemo(() => {
    const gastoMensal = saldos.reduce((s, p) => s + Number(p.gasto_mensal_patrocinio) + Number(p.gasto_mensal_acoes), 0)
    const gastoPatrocinio = saldos.reduce((s, p) => s + Number(p.gasto_mensal_patrocinio), 0)
    const gastoAcoes = saldos.reduce((s, p) => s + Number(p.gasto_mensal_acoes), 0)
    const pendentes = patrocinios.filter(p => p.status === 'pendente').length
    const acoesAbertas = acoes.filter(a => a.status === 'aberta').length
    const prazoVencendo = acoes.filter(a => {
      const dias = Math.ceil((new Date(a.prazo_envio).getTime() - Date.now()) / 86400000)
      return dias >= 0 && dias <= 2
    }).length
    return { gastoMensal, gastoPatrocinio, gastoAcoes, pendentes, acoesAbertas, prazoVencendo }
  }, [saldos, patrocinios, acoes])

  // Hoje
  const hoje = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  return (
    <div className="flex flex-col min-h-full">
      <Header title="Marketing" description={`Visão geral — ${hoje}`} />

      <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-6">

        {/* Ações rápidas */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Resumo do mês</h2>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-8 gap-1.5 text-[12px]">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            Atualizar
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard label="Gasto no mês" value={fmtBRL(kpis.gastoMensal)} sub="Patrocínios + Ações" icon={TrendingUp} color="bg-blue-500" />
              <KpiCard label="Patrocínios" value={fmtBRL(kpis.gastoPatrocinio)} sub={`${patrocinios.filter(p=>p.status==='aprovado').length} aprovados`} icon={Gift} color="bg-emerald-500" />
              <KpiCard label="Ações" value={fmtBRL(kpis.gastoAcoes)} sub={`${kpis.acoesAbertas} ação(ões) em aberto`} icon={Megaphone} color="bg-violet-500" />
              <KpiCard label="Pendências" value={String(kpis.pendentes + kpis.prazoVencendo)}
                sub={kpis.pendentes > 0 ? `${kpis.pendentes} patrocínio(s) aguardando` : 'Tudo em dia'}
                icon={kpis.pendentes > 0 ? AlertTriangle : CheckCircle2}
                color={kpis.pendentes > 0 ? 'bg-orange-500' : 'bg-gray-400'}
              />
            </div>

            {/* Alertas */}
            {(kpis.pendentes > 0 || kpis.prazoVencendo > 0) && (
              <div className="space-y-2">
                {kpis.pendentes > 0 && (
                  <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-700 rounded-lg px-4 py-2.5 text-[13px]">
                    <Clock className="w-4 h-4 shrink-0" />
                    <span><strong>{kpis.pendentes}</strong> patrocínio(s) aguardando aprovação</span>
                    <Link href="/marketing/patrocinio" className="ml-auto text-orange-600 hover:underline text-[12px] flex items-center gap-1">
                      Ver <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                )}
                {kpis.prazoVencendo > 0 && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5 text-[13px]">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span><strong>{kpis.prazoVencendo}</strong> ação(ões) com prazo vencendo em até 2 dias</span>
                    <Link href="/marketing/acoes" className="ml-auto text-red-600 hover:underline text-[12px] flex items-center gap-1">
                      Ver <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Ranking de postos */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <h3 className="text-[13px] font-semibold text-gray-700">Utilização por posto (mês)</h3>
                  <Link href="/marketing/patrocinio" className="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5">
                    Ver todos <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
                <div className="px-4 pb-4 space-y-3">
                  {saldos.length === 0 && (
                    <p className="text-[12px] text-gray-400 text-center py-4">Nenhum dado disponível</p>
                  )}
                  {saldos.filter(s => !isGerente || s.posto_id === postoFixoId).slice(0, 8).map(s => {
                    const pct = s.limite_mensal > 0 ? (Number(s.gasto_mensal_patrocinio) / Number(s.limite_mensal)) * 100 : 0
                    return (
                      <div key={s.posto_id}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[12px] text-gray-700 font-medium truncate max-w-[60%]">{s.posto_nome}</span>
                          <span className={cn('text-[11px] font-semibold', pct >= 100 ? 'text-red-600' : pct >= 80 ? 'text-orange-500' : 'text-gray-500')}>
                            {fmtBRL(Number(s.gasto_mensal_patrocinio))} / {fmtBRL(Number(s.limite_mensal))}
                          </span>
                        </div>
                        <ProgressBar pct={pct} />
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Ações abertas */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <h3 className="text-[13px] font-semibold text-gray-700">Ações em aberto</h3>
                  <Link href="/marketing/acoes" className="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5">
                    Gerenciar <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
                <div className="px-4 pb-4 space-y-2">
                  {acoes.filter(a => a.status === 'aberta').length === 0 && (
                    <p className="text-[12px] text-gray-400 text-center py-4">Nenhuma ação aberta no momento</p>
                  )}
                  {acoes.filter(a => a.status === 'aberta').slice(0, 5).map(a => {
                    const total    = a.marketing_acao_postos?.length ?? 0
                    const enviados = a.marketing_acao_postos?.filter(p => ['enviado','aprovado'].includes(p.status)).length ?? 0
                    const pct      = total > 0 ? (enviados / total) * 100 : 0
                    const diasRestantes = Math.ceil((new Date(a.prazo_envio).getTime() - Date.now()) / 86400000)
                    return (
                      <div key={a.id} className="rounded-lg bg-gray-50 p-3">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <span className="text-[12px] font-medium text-gray-700">{a.titulo}</span>
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full shrink-0 font-medium',
                            diasRestantes < 0 ? 'bg-red-100 text-red-700' :
                            diasRestantes <= 2 ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                          )}>
                            {diasRestantes < 0 ? 'Prazo vencido' : `${diasRestantes}d restantes`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <ProgressBar pct={pct} className="flex-1" />
                          <span className="text-[11px] text-gray-500 shrink-0">{enviados}/{total} postos</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Links rápidos */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { href: '/marketing/patrocinio', icon: Gift, label: 'Patrocínios', desc: 'Solicitações e aprovações', color: 'text-emerald-600 bg-emerald-50' },
                { href: '/marketing/acoes', icon: Megaphone, label: 'Ações', desc: 'Campanhas e comprovantes', color: 'text-violet-600 bg-violet-50' },
                { href: '/marketing/conciliacao', icon: Link2, label: 'Conciliação', desc: 'Sistema vs AutoSystem', color: 'text-blue-600 bg-blue-50' },
              ].map(item => (
                <Link key={item.href} href={item.href}
                  className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl p-4 hover:shadow-md transition-shadow group"
                >
                  <div className={cn('p-2.5 rounded-lg', item.color)}>
                    <item.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold text-gray-800">{item.label}</p>
                    <p className="text-[11px] text-gray-400">{item.desc}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                </Link>
              ))}
            </div>

            {/* Enviar para Contas a Pagar */}
            {!isGerente && <SolicitacoesPagamentoMarketing />}
          </>
        )}
      </div>
    </div>
  )
}
