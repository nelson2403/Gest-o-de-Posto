'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils/cn'
import { ClipboardList, Wallet, CheckCircle2, AlertTriangle, Clock, ChevronRight, Loader2, RefreshCw, TrendingDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function KpiCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: React.ElementType; color: string
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

export default function ContasPagarPage() {
  const hoje = new Date()
  const competencia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
  const [comps, setComps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/contas-pagar/competencias?competencia=${competencia}`)
      const json = await res.json()
      setComps(json.competencias ?? [])
    } catch {
      toast({ title: 'Erro ao carregar', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const totalPrevisto = comps.reduce((s, c) => s + Number(c.valor_previsto), 0)
  const totalPago     = comps.filter(c => c.status === 'pago').reduce((s, c) => s + Number(c.valor_pago ?? c.valor_previsto), 0)
  const emAtraso      = comps.filter(c => c.em_atraso).length
  const pendentes     = comps.filter(c => c.status === 'previsto' && !c.em_atraso).length
  const pagos         = comps.filter(c => c.status === 'pago').length

  const mesLabel = hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  return (
    <div className="flex flex-col h-full">
      <Header title="Contas a Pagar" description={`Resumo — ${mesLabel}`} />

      <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-6">

        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Mês atual</h2>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard label="Previsto no mês"  value={fmtBRL(totalPrevisto)} sub={`${comps.length} conta(s)`}          icon={TrendingDown}  color="bg-blue-500" />
              <KpiCard label="Pago"             value={fmtBRL(totalPago)}     sub={`${pagos} conta(s) quitada(s)`}       icon={CheckCircle2}  color="bg-emerald-500" />
              <KpiCard label="Pendente"         value={String(pendentes)}     sub="A vencer no mês"                      icon={Clock}         color="bg-amber-500" />
              <KpiCard label="Em Atraso"        value={String(emAtraso)}      sub={emAtraso > 0 ? 'Atenção!' : 'Tudo em dia'} icon={AlertTriangle} color={emAtraso > 0 ? 'bg-red-500' : 'bg-gray-400'} />
            </div>

            {emAtraso > 0 && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5 text-[13px]">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span><strong>{emAtraso}</strong> conta(s) em atraso</span>
                <Link href="/contas-pagar/fixas" className="ml-auto text-red-600 hover:underline text-[12px] flex items-center gap-1">
                  Ver <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { href: '/contas-pagar/conferencia', icon: ClipboardList, label: 'Conferência Diária', desc: 'Lançar e conferir com AutoSystem', color: 'text-blue-600 bg-blue-50' },
                { href: '/contas-pagar/fixas',       icon: Wallet,        label: 'Despesas Fixas',     desc: 'Contas fixas por posto',           color: 'text-emerald-600 bg-emerald-50' },
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
