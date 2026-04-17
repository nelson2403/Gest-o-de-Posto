'use client'

import { useState, useMemo } from 'react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils/cn'
import {
  Loader2, Link2, CheckCircle2, AlertTriangle, XCircle,
  Search, RefreshCw,
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface ItemConciliacao {
  tipo: 'patrocinio' | 'acao'
  posto_nome: string
  posto_id: string
  valor: number
  data: string
  motivo?: string
  documento?: string
  baixado?: boolean
  status_conciliacao: 'conciliado' | 'divergencia' | 'so_sistema' | 'so_caixa'
  divergencia_valor?: number
  interno?: {
    id: string
    valor: number
    data_evento?: string
    patrocinado?: string
    postos?: { nome: string }
    marketing_acoes?: { titulo: string }
  } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtBRL(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtDate(d: string) {
  try { return new Date(d).toLocaleDateString('pt-BR') } catch { return d }
}

const STATUS_CFG = {
  conciliado:  { label: 'Conciliado',    icon: CheckCircle2, cls: 'bg-green-100 text-green-700 border-green-200',  row: '' },
  divergencia: { label: 'Divergência',   icon: AlertTriangle, cls: 'bg-red-100 text-red-700 border-red-200',       row: 'bg-red-50' },
  so_sistema:  { label: 'Só no sistema', icon: AlertTriangle, cls: 'bg-orange-100 text-orange-700 border-orange-200', row: 'bg-orange-50' },
  so_caixa:    { label: 'Só no caixa',  icon: XCircle,       cls: 'bg-yellow-100 text-yellow-700 border-yellow-200', row: 'bg-yellow-50' },
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ConciliacaoPage() {
  const hoje = new Date().toISOString().slice(0, 10)
  const anoAtual = new Date().getFullYear()

  const [dataIni, setDataIni] = useState(`${anoAtual}-01-01`)
  const [dataFim, setDataFim] = useState(hoje)
  const [resultado, setResultado] = useState<ItemConciliacao[]>([])
  const [movExterno, setMovExterno] = useState(0)
  const [loading, setLoading] = useState(false)
  const [buscado, setBuscado] = useState(false)
  const [filtro, setFiltro] = useState<'todos' | 'conciliado' | 'divergencia' | 'so_sistema' | 'so_caixa'>('todos')

  async function buscar() {
    setLoading(true)
    try {
      const res = await fetch(`/api/marketing/conciliacao?data_ini=${dataIni}&data_fim=${dataFim}`)
      const json = await res.json()
      if (!res.ok) { toast({ title: json.error, variant: 'destructive' }); return }
      setResultado(json.resultado ?? [])
      setMovExterno(json.movimentos_externo ?? 0)
      setBuscado(true)
    } catch {
      toast({ title: 'Erro ao buscar dados', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const lista = useMemo(() => filtro === 'todos' ? resultado : resultado.filter(r => r.status_conciliacao === filtro), [resultado, filtro])

  const stats = useMemo(() => ({
    total:      resultado.length,
    conciliado: resultado.filter(r => r.status_conciliacao === 'conciliado').length,
    divergencia: resultado.filter(r => r.status_conciliacao === 'divergencia').length,
    so_sistema: resultado.filter(r => r.status_conciliacao === 'so_sistema').length,
    so_caixa:   resultado.filter(r => r.status_conciliacao === 'so_caixa').length,
  }), [resultado])

  return (
    <div className="flex flex-col h-full">
      <Header title="Conciliação" description="Sistema interno vs AutoSystem" />

      <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-5">

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-gray-500 font-medium">De</span>
              <Input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} className="h-9 text-[13px] w-full" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-gray-500 font-medium">Até</span>
              <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="h-9 text-[13px] w-full" />
            </div>
            <Button size="sm" onClick={buscar} disabled={loading} className="gap-1.5 text-[13px] col-span-2 sm:col-span-1">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Buscar
            </Button>
            {buscado && (
              <Button variant="outline" size="sm" onClick={buscar} disabled={loading} className="gap-1.5 text-[13px] col-span-2 sm:col-span-1">
                <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
                Atualizar
              </Button>
            )}
          </div>
        </div>

        {/* KPIs de resultado */}
        {buscado && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'Total',         value: stats.total,        cls: 'border-gray-200 text-gray-700', active: filtro === 'todos',      key: 'todos' as const },
                { label: 'Conciliados',   value: stats.conciliado,   cls: 'border-green-200 text-green-700',  active: filtro === 'conciliado',  key: 'conciliado' as const },
                { label: 'Divergências',  value: stats.divergencia,  cls: 'border-red-200 text-red-700',      active: filtro === 'divergencia', key: 'divergencia' as const },
                { label: 'Só no sistema', value: stats.so_sistema,   cls: 'border-orange-200 text-orange-700', active: filtro === 'so_sistema', key: 'so_sistema' as const },
                { label: 'Só no caixa',   value: stats.so_caixa,     cls: 'border-yellow-200 text-yellow-700', active: filtro === 'so_caixa',  key: 'so_caixa' as const },
              ].map(item => (
                <button key={item.key} onClick={() => setFiltro(item.key)}
                  className={cn(
                    'bg-white rounded-lg border-2 px-3 py-2.5 text-center transition-all hover:shadow-sm',
                    item.active ? item.cls + ' shadow-sm' : 'border-gray-100 text-gray-500'
                  )}
                >
                  <p className="text-xl font-bold">{item.value}</p>
                  <p className="text-[11px] mt-0.5">{item.label}</p>
                </button>
              ))}
            </div>

            {/* Info AutoSystem */}
            <div className="text-[12px] text-gray-400 flex items-center gap-1">
              <Link2 className="w-3.5 h-3.5" />
              {movExterno} movimentação(ões) encontrada(s) no AutoSystem (marketing / patrocínio / ação)
            </div>

            {/* Tabela */}
            {lista.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-[13px]">Nenhum item nesta categoria</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-500 uppercase tracking-wide">Tipo</th>
                        <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-500 uppercase tracking-wide">Posto</th>
                        <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-500 uppercase tracking-wide">Motivo (AutoSystem)</th>
                        <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-500 uppercase tracking-wide">Data</th>
                        <th className="text-right px-4 py-2.5 text-[11px] font-medium text-gray-500 uppercase tracking-wide">Vlr. Sistema</th>
                        <th className="text-right px-4 py-2.5 text-[11px] font-medium text-gray-500 uppercase tracking-wide">Vlr. Caixa</th>
                        <th className="text-right px-4 py-2.5 text-[11px] font-medium text-gray-500 uppercase tracking-wide">Diferença</th>
                        <th className="text-center px-4 py-2.5 text-[11px] font-medium text-gray-500 uppercase tracking-wide">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {lista.map((item, i) => {
                        const cfg = STATUS_CFG[item.status_conciliacao]
                        const vlrSistema = item.status_conciliacao === 'so_caixa' ? null : item.interno?.valor ?? null
                        const vlrCaixa   = item.status_conciliacao === 'so_sistema' ? null : item.valor
                        const diferenca  = item.divergencia_valor ?? null
                        return (
                          <tr key={i} className={cn('hover:bg-gray-50/50 transition-colors', cfg.row)}>
                            <td className="px-4 py-2.5">
                              <span className={cn('text-[11px] px-1.5 py-0.5 rounded font-medium',
                                item.tipo === 'patrocinio' ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'
                              )}>
                                {item.tipo === 'patrocinio' ? 'PAT' : 'AÇÃ'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-medium text-gray-700">{item.posto_nome}</td>
                            <td className="px-4 py-2.5 text-gray-500 max-w-[200px] truncate" title={item.motivo ?? '—'}>
                              {item.motivo ?? <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-gray-500">{fmtDate(item.data ?? item.interno?.data_evento ?? '')}</td>
                            <td className="px-4 py-2.5 text-right text-gray-700">
                              {vlrSistema != null ? fmtBRL(vlrSistema) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-700">
                              {vlrCaixa != null ? fmtBRL(vlrCaixa) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {diferenca != null && Math.abs(diferenca) > 0.01 ? (
                                <span className={cn('font-semibold', diferenca > 0 ? 'text-red-600' : 'text-orange-600')}>
                                  {diferenca > 0 ? '+' : ''}{fmtBRL(diferenca)}
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <Badge variant="outline" className={cn('text-[11px]', cfg.cls)}>
                                <cfg.icon className="w-3 h-3 mr-1" />
                                {cfg.label}
                              </Badge>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {!buscado && !loading && (
          <div className="text-center py-20 text-gray-400">
            <Link2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-[14px] font-medium">Selecione o período e clique em Buscar</p>
            <p className="text-[12px] mt-1">Serão comparados os registros internos com as movimentações do AutoSystem</p>
          </div>
        )}
      </div>
    </div>
  )
}
