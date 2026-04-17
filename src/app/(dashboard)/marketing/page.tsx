'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils/cn'
import {
  Megaphone, Gift, Link2, AlertTriangle, CheckCircle2,
  Clock, TrendingUp, ChevronRight, Loader2, RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthContext } from '@/contexts/AuthContext'

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
  const isGerente   = usuario?.role === 'gerente'
  const postoFixoId = usuario?.posto_fechamento_id ?? null

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
    <div className="flex flex-col h-full">
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
          </>
        )}
      </div>
    </div>
  )
}
