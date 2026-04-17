'use client'

import { useEffect, useState, useCallback } from 'react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils/cn'
import { useAuthContext } from '@/contexts/AuthContext'
import type { Role } from '@/types/database.types'
import {
  Loader2, RefreshCw, CheckCircle2, AlertTriangle, Clock,
  TrendingDown, Database,
} from 'lucide-react'

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(s: string) {
  if (!s) return '—'
  return new Date(s + 'T12:00:00').toLocaleDateString('pt-BR')
}

const SITUACAO_CFG: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  a_vencer:  { label: 'A Vencer',   cls: 'bg-blue-100 text-blue-700 border-blue-200',    icon: Clock },
  em_atraso: { label: 'Em Atraso',  cls: 'bg-red-100 text-red-700 border-red-200',       icon: AlertTriangle },
  pago:      { label: 'Pago',       cls: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle2 },
}

// Primeiro e último dia do mês atual
function mesAtual() {
  const h = new Date()
  const ini = new Date(h.getFullYear(), h.getMonth(), 1).toISOString().slice(0, 10)
  const fim = new Date(h.getFullYear(), h.getMonth() + 1, 0).toISOString().slice(0, 10)
  return { ini, fim }
}

export default function TitulosASPage() {
  const { usuario } = useAuthContext()
  const role = usuario?.role as Role | undefined
  const isGerente = role === 'gerente'

  const { ini: iniDefault, fim: fimDefault } = mesAtual()

  const [postos, setPostos]               = useState<any[]>([])
  const [selectedPosto, setSelectedPosto] = useState('')
  const [venctoIni, setVenctoIni]         = useState(iniDefault)
  const [venctoFim, setVenctoFim]         = useState(fimDefault)
  const [situacao, setSituacao]           = useState('todas')

  const [titulos, setTitulos]   = useState<any[]>([])
  const [totais, setTotais]     = useState<any>(null)
  const [postoNome, setPostoNome] = useState('')
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    fetch('/api/postos').then(r => r.json()).then(d => {
      const list = d.postos ?? []
      setPostos(list)
      if (isGerente && usuario?.posto_fechamento_id) setSelectedPosto(usuario.posto_fechamento_id)
    })
  }, [])

  const load = useCallback(async () => {
    if (!selectedPosto) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        posto_id: selectedPosto,
        vencto_ini: venctoIni,
        vencto_fim: venctoFim,
        situacao,
      })
      const res = await fetch(`/api/contas-pagar/titulos-as?${params}`)
      const json = await res.json()
      if (!res.ok) {
        toast({ title: json.error ?? 'Erro ao carregar', variant: 'destructive' })
        return
      }
      setTitulos(json.titulos ?? [])
      setTotais(json.totais ?? null)
      setPostoNome(json.posto ?? '')
    } catch {
      toast({ title: 'Erro de conexão', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [selectedPosto, venctoIni, venctoFim, situacao])

  useEffect(() => { load() }, [load])

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Contas a Pagar — AutoSystem"
        subtitle="Títulos registrados no AutoSystem"
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex flex-wrap items-end gap-3">
            {!isGerente && (
              <div className="flex-1 min-w-[200px]">
                <Label className="text-[12px] text-gray-500 mb-1 block">Posto / Empresa</Label>
                <Select value={selectedPosto} onValueChange={setSelectedPosto}>
                  <SelectTrigger className="h-9 text-[13px]">
                    <SelectValue placeholder="Selecione o posto" />
                  </SelectTrigger>
                  <SelectContent>
                    {postos.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="text-[12px] text-gray-500 mb-1 block">Vencto. de</Label>
              <Input type="date" value={venctoIni} onChange={e => setVenctoIni(e.target.value)} className="h-9 text-[13px] w-38" />
            </div>
            <div>
              <Label className="text-[12px] text-gray-500 mb-1 block">até</Label>
              <Input type="date" value={venctoFim} onChange={e => setVenctoFim(e.target.value)} className="h-9 text-[13px] w-38" />
            </div>

            <div className="min-w-[150px]">
              <Label className="text-[12px] text-gray-500 mb-1 block">Situação</Label>
              <Select value={situacao} onValueChange={setSituacao}>
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="a_vencer">A Vencer</SelectItem>
                  <SelectItem value="em_atraso">Em Atraso</SelectItem>
                  <SelectItem value="pago">Pagas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              size="sm" variant="outline"
              onClick={load}
              disabled={loading || !selectedPosto}
              className="h-9 gap-1.5 text-[12px]"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
              Atualizar
            </Button>
          </div>
        </div>

        {!selectedPosto ? (
          <div className="text-center py-20 text-gray-400">
            <Database className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p className="text-[13px]">Selecione um posto para carregar os títulos</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            {/* KPIs */}
            {totais && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Total no período', value: fmtBRL(totais.total),      sub: `${totais.qt_total} título(s)`,      icon: TrendingDown, cls: 'bg-gray-500' },
                  { label: 'A Vencer',          value: fmtBRL(totais.a_vencer),  sub: `${totais.qt_a_vencer} título(s)`,   icon: Clock,        cls: 'bg-blue-500' },
                  { label: 'Em Atraso',         value: fmtBRL(totais.em_atraso), sub: `${totais.qt_em_atraso} título(s)`,  icon: AlertTriangle, cls: totais.qt_em_atraso > 0 ? 'bg-red-500' : 'bg-gray-400' },
                  { label: 'Pagos',             value: fmtBRL(totais.pago),      sub: `${totais.qt_pago} título(s)`,       icon: CheckCircle2, cls: 'bg-emerald-500' },
                ].map(k => (
                  <div key={k.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-start gap-3">
                    <div className={cn('p-2 rounded-lg', k.cls)}>
                      <k.icon className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-500 uppercase tracking-wide font-medium">{k.label}</p>
                      <p className="text-lg font-bold text-gray-800 mt-0.5">{k.value}</p>
                      <p className="text-[11px] text-gray-400">{k.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tabela */}
            {titulos.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Database className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p className="text-[13px]">Nenhum título encontrado para os filtros selecionados</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-blue-500" />
                    <p className="text-[13px] font-semibold text-gray-700">{postoNome}</p>
                    <span className="text-[11px] text-gray-400">
                      {fmtDate(venctoIni)} – {fmtDate(venctoFim)}
                    </span>
                  </div>
                  <span className="text-[12px] text-gray-400">{titulos.length} título(s)</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Vencto.</th>
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Documento</th>
                        <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Valor</th>
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Pessoa / Fornecedor</th>
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Motivo</th>
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Observação</th>
                        <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {titulos.map((t, i) => {
                        const cfg = SITUACAO_CFG[t.situacao] ?? SITUACAO_CFG.a_vencer
                        return (
                          <tr key={t.mlid ?? i} className={cn(
                            'hover:bg-gray-50/50',
                            t.situacao === 'em_atraso' && 'bg-red-50/30'
                          )}>
                            <td className={cn(
                              'px-4 py-2.5 font-medium whitespace-nowrap',
                              t.situacao === 'em_atraso' ? 'text-red-600' : 'text-gray-700'
                            )}>
                              {fmtDate(t.vencto)}
                            </td>
                            <td className="px-4 py-2.5 text-gray-600 font-mono text-[12px]">{t.documento || '—'}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-gray-700 whitespace-nowrap">
                              {fmtBRL(t.valor)}
                            </td>
                            <td className="px-4 py-2.5 text-gray-700 max-w-[220px]">
                              <span className="truncate block">{t.pessoa_nome || '—'}</span>
                            </td>
                            <td className="px-4 py-2.5 text-gray-500 text-[12px] max-w-[160px]">
                              <span className="truncate block">{t.motivo_nome || '—'}</span>
                            </td>
                            <td className="px-4 py-2.5 text-gray-400 text-[12px] max-w-[180px]">
                              <span className="truncate block">{t.obs || '—'}</span>
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
                    <tfoot>
                      <tr className="bg-gray-50 border-t-2 border-gray-200">
                        <td colSpan={2} className="px-4 py-2.5 text-[12px] font-semibold text-gray-600">
                          Total ({titulos.length} títulos)
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-gray-800 text-[13px]">
                          {totais ? fmtBRL(totais.total) : '—'}
                        </td>
                        <td colSpan={4} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
