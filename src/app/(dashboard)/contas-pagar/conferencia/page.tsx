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
  Loader2, RefreshCw, CheckCircle2, AlertTriangle,
  HelpCircle, Pencil, Save, X, Database,
} from 'lucide-react'

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(s: string) {
  if (!s) return '—'
  return new Date(s + 'T12:00:00').toLocaleDateString('pt-BR')
}

const TOLERANCIA = 0.01

const SITUACAO_CFG: Record<string, { label: string; cls: string }> = {
  a_vencer:  { label: 'A Vencer',  cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  em_atraso: { label: 'Em Atraso', cls: 'bg-red-100 text-red-700 border-red-200' },
  pago:      { label: 'Pago',      cls: 'bg-green-100 text-green-700 border-green-200' },
}

export default function ConferenciaPage() {
  const { usuario } = useAuthContext()
  const role = usuario?.role as Role | undefined
  const isGerente = role === 'gerente'

  const [postos, setPostos]               = useState<any[]>([])
  const [selectedPosto, setSelectedPosto] = useState('')
  const [selectedData, setSelectedData]   = useState(new Date().toISOString().slice(0, 10))

  const [titulos, setTitulos]   = useState<any[]>([])
  const [totais, setTotais]     = useState<any>(null)
  const [postoNome, setPostoNome] = useState('')
  const [loading, setLoading]   = useState(false)
  const [erroAS, setErroAS]     = useState('')

  // Lançamento manual
  const [lancamento, setLancamento] = useState<any | null>(null)
  const [editando, setEditando]     = useState(false)
  const [valorInput, setValorInput] = useState('')
  const [saving, setSaving]         = useState(false)

  useEffect(() => {
    fetch('/api/postos').then(r => r.json()).then(d => {
      const list = d.postos ?? []
      setPostos(list)
      if (isGerente && usuario?.posto_fechamento_id)
        setSelectedPosto(usuario.posto_fechamento_id)
    })
  }, [])

  const load = useCallback(async () => {
    if (!selectedPosto || !selectedData) return
    setLoading(true)
    setErroAS('')
    setTitulos([])
    setTotais(null)

    // Lookback 1 ano — mostra vencidos até a data + o que vence nessa data
    const d = new Date(selectedData)
    d.setFullYear(d.getFullYear() - 1)
    const venctoIni = d.toISOString().slice(0, 10)

    const params = new URLSearchParams({
      posto_id:   selectedPosto,
      vencto_ini: venctoIni,
      vencto_fim: selectedData,
      situacao:   'aberto',
    })

    const [asRes, lancRes] = await Promise.all([
      fetch(`/api/contas-pagar/titulos-as?${params}`),
      fetch(`/api/contas-pagar/lancamentos?posto_id=${selectedPosto}&data=${selectedData}`),
    ])

    const asJson   = await asRes.json()
    const lancJson = await lancRes.json()

    setLoading(false)

    if (!asRes.ok) {
      setErroAS(asJson.error ?? 'Erro ao buscar AutoSystem')
    } else {
      setTitulos(asJson.titulos ?? [])
      setTotais(asJson.totais ?? null)
      setPostoNome(asJson.posto ?? '')
    }

    const existing = (lancJson.lancamentos ?? [])[0] ?? null
    setLancamento(existing)
    setEditando(!existing)
    setValorInput(existing ? String(existing.valor) : '')
  }, [selectedPosto, selectedData])

  useEffect(() => { load() }, [load])

  async function handleSalvar() {
    const val = parseFloat(valorInput.replace(',', '.'))
    if (isNaN(val) || val <= 0)
      return toast({ title: 'Informe um valor válido', variant: 'destructive' })

    setSaving(true)
    try {
      const totalAS = totais?.total ?? null
      let status = 'pendente'
      if (totalAS !== null) {
        status = Math.abs(val - totalAS) <= TOLERANCIA ? 'encontrado' : 'divergente'
      }

      let res: Response
      if (lancamento) {
        res = await fetch(`/api/contas-pagar/lancamentos/${lancamento.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            valor: val, status,
            valor_autosystem: totalAS,
            divergencia_valor: totalAS !== null ? parseFloat((totalAS - val).toFixed(2)) : null,
          }),
        })
      } else {
        res = await fetch('/api/contas-pagar/lancamentos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            posto_id: selectedPosto,
            data_lancamento: selectedData,
            descricao: 'Conferência diária',
            valor: val, status,
            valor_autosystem: totalAS,
            divergencia_valor: totalAS !== null ? parseFloat((totalAS - val).toFixed(2)) : null,
          }),
        })
      }

      const json = await res.json()
      if (!res.ok) return toast({ title: json.error, variant: 'destructive' })
      setLancamento(json.lancamento)
      setEditando(false)
      toast({ title: status === 'encontrado' ? 'Conferido! Valores batem.' : 'Salvo — verifique a divergência.' })
    } finally { setSaving(false) }
  }

  const diff = lancamento && totais ? totais.total - lancamento.valor : null
  const totalAS = totais?.total ?? null

  return (
    <div className="flex flex-col h-full">
      <Header title="Conferência Diária" description="Títulos a pagar vs valor informado" />

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
                    {postos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {isGerente && selectedPosto && (
              <div className="flex items-center px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-[13px] font-medium text-gray-700">{postoNome}</span>
              </div>
            )}
            <div>
              <Label className="text-[12px] text-gray-500 mb-1 block">Data</Label>
              <Input
                type="date"
                value={selectedData}
                onChange={e => setSelectedData(e.target.value)}
                className="h-9 text-[13px] w-40"
              />
            </div>
            <Button size="sm" variant="outline" onClick={load}
              disabled={loading || !selectedPosto} className="h-9 gap-1.5 text-[12px]">
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
              Atualizar
            </Button>
          </div>
        </div>

        {!selectedPosto ? (
          <div className="text-center py-20 text-gray-400">
            <Database className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p className="text-[13px]">Selecione um posto para começar</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : erroAS ? (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-[13px] text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {erroAS}
          </div>
        ) : (
          <>
            {/* KPIs */}
            {totais && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Total em aberto', value: fmtBRL(totais.total),     sub: `${totais.qt_total} título(s)`,      color: 'bg-gray-500' },
                  { label: 'A Vencer',        value: fmtBRL(totais.a_vencer),  sub: `${totais.qt_a_vencer} título(s)`,   color: 'bg-blue-500' },
                  { label: 'Em Atraso',       value: fmtBRL(totais.em_atraso), sub: `${totais.qt_em_atraso} título(s)`,  color: totais.qt_em_atraso > 0 ? 'bg-red-500' : 'bg-gray-400' },
                  { label: 'Pagos',           value: fmtBRL(totais.pago),      sub: `${totais.qt_pago} título(s)`,       color: 'bg-emerald-500' },
                ].map(k => (
                  <div key={k.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-start gap-3">
                    <div className={cn('p-2 rounded-lg', k.color)}>
                      <Database className="w-4 h-4 text-white" />
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

            {/* Tabela de títulos */}
            {titulos.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p className="text-[13px]">Nenhum título em aberto até esta data</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-blue-500" />
                    <p className="text-[13px] font-semibold text-gray-700">{postoNome}</p>
                    <span className="text-[11px] text-gray-400">até {fmtDate(selectedData)}</span>
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
                        <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {titulos.map((t, i) => {
                        const cfg = SITUACAO_CFG[t.situacao] ?? SITUACAO_CFG.a_vencer
                        return (
                          <tr key={t.mlid ?? i} className={cn('hover:bg-gray-50/50', t.situacao === 'em_atraso' && 'bg-red-50/30')}>
                            <td className={cn('px-4 py-2.5 font-medium whitespace-nowrap', t.situacao === 'em_atraso' ? 'text-red-600' : 'text-gray-700')}>
                              {fmtDate(t.vencto)}
                            </td>
                            <td className="px-4 py-2.5 text-gray-500 font-mono text-[12px]">{t.documento || '—'}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-gray-700 whitespace-nowrap">{fmtBRL(t.valor)}</td>
                            <td className="px-4 py-2.5 text-gray-700 max-w-[220px]">
                              <span className="truncate block">{t.pessoa_nome || '—'}</span>
                            </td>
                            <td className="px-4 py-2.5 text-gray-500 text-[12px] max-w-[180px]">
                              <span className="truncate block">{t.motivo_nome || '—'}</span>
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <Badge variant="outline" className={cn('text-[11px]', cfg.cls)}>
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
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Conferência manual */}
            {titulos.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <p className="text-[13px] font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-orange-500" />
                  Valor informado pela responsável
                </p>

                {editando ? (
                  <div className="flex items-end gap-3">
                    <div className="flex-1 max-w-xs">
                      <Label className="text-[12px] text-gray-500 mb-1 block">Total pago (R$)</Label>
                      <Input
                        type="number" step="0.01" min="0"
                        value={valorInput}
                        onChange={e => setValorInput(e.target.value)}
                        placeholder="0,00"
                        className="h-10 text-base font-semibold"
                        autoFocus
                      />
                    </div>
                    <Button onClick={handleSalvar} disabled={saving}
                      className="h-10 bg-orange-500 hover:bg-orange-600 gap-1.5 px-5">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Salvar
                    </Button>
                    {lancamento && (
                      <Button variant="ghost" onClick={() => { setEditando(false); setValorInput(String(lancamento.valor)) }}
                        disabled={saving} className="h-10">
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-bold text-gray-800">{fmtBRL(Number(lancamento?.valor ?? 0))}</span>
                    <Button size="sm" variant="outline" onClick={() => setEditando(true)} className="h-8 gap-1.5 text-[12px]">
                      <Pencil className="w-3 h-3" /> Editar
                    </Button>
                  </div>
                )}

                {/* Comparativo */}
                {lancamento && totalAS !== null && (
                  <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 divide-y divide-gray-100">
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-[12px] text-gray-500">Total AutoSystem (em aberto)</span>
                      <span className="text-[13px] font-semibold text-gray-700">{fmtBRL(totalAS)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-[12px] text-gray-500">Valor informado</span>
                      <span className="text-[13px] font-semibold text-gray-700">{fmtBRL(Number(lancamento.valor))}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-[12px] text-gray-500">Diferença</span>
                      <span className={cn('text-[13px] font-bold',
                        diff !== null && Math.abs(diff) <= TOLERANCIA ? 'text-green-600' : 'text-red-600'
                      )}>
                        {diff !== null
                          ? Math.abs(diff) <= TOLERANCIA
                            ? '✓ Conferido'
                            : `${diff > 0 ? '+' : ''}${fmtBRL(diff)}`
                          : '—'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
