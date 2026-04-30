'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  FileText, AlertCircle, Clock, CheckCircle2,
  TrendingDown, Building2, RefreshCw, Calendar,
  Send, X, Plus, ChevronDown, ChevronRight, Loader2,
} from 'lucide-react'
import { useAuthContext } from '@/contexts/AuthContext'
import { toast } from '@/hooks/use-toast'

// ── Tipos ────────────────────────────────────────────────────────
interface Solicitacao {
  id: string; titulo: string; fornecedor: string | null; valor: number | null
  data_vencimento: string | null; status: string; criado_em: string; setor: string
}

const STATUS_COLOR_SOL: Record<string, string> = {
  pendente:   'bg-yellow-900/40 text-yellow-400',
  em_analise: 'bg-blue-900/40 text-blue-400',
  aprovado:   'bg-emerald-900/40 text-emerald-400',
  pago:       'bg-green-900/40 text-green-400',
  rejeitado:  'bg-red-900/40 text-red-400',
}
const STATUS_LABEL_SOL: Record<string, string> = {
  pendente: 'Pendente', em_analise: 'Em Análise', aprovado: 'Aprovado', pago: 'Pago', rejeitado: 'Rejeitado',
}

function fmtBRL(v: number | null) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate2(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

function SolicitacoesPagamentoFiscal() {
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([])
  const [loading, setLoading]           = useState(true)
  const [showNova, setShowNova]         = useState(false)
  const [saving, setSaving]             = useState(false)
  const [form, setForm] = useState({ titulo: '', fornecedor: '', valor: '', data_vencimento: '', descricao: '' })

  async function carregar() {
    setLoading(true)
    const r = await fetch('/api/solicitacoes-pagamento?setor=fiscal')
    const json = await r.json()
    setSolicitacoes(json.solicitacoes ?? [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!form.titulo.trim()) { toast({ variant: 'destructive', title: 'Informe o título da solicitação' }); return }
    setSaving(true)
    const r = await fetch('/api/solicitacoes-pagamento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, setor: 'fiscal', valor: form.valor ? Number(form.valor.replace(',', '.')) : null }),
    })
    if (r.ok) {
      toast({ title: 'Solicitação enviada para Contas a Pagar!' })
      setForm({ titulo: '', fornecedor: '', valor: '', data_vencimento: '', descricao: '' })
      setShowNova(false)
      carregar()
    } else {
      toast({ variant: 'destructive', title: 'Erro ao enviar solicitação' })
    }
    setSaving(false)
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-blue-400" />
          <span className="font-semibold text-white text-sm">Enviar para Contas a Pagar</span>
          <span className="text-xs text-gray-500">({solicitacoes.length})</span>
        </div>
        <button
          onClick={() => setShowNova(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Nova Solicitação
        </button>
      </div>

      {/* Formulário nova solicitação */}
      {showNova && (
        <form onSubmit={enviar} className="p-5 border-b border-gray-800 space-y-3 bg-gray-800/40">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-400 mb-1">Título / Descrição curta *</label>
              <input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} required
                placeholder="Ex: Pagamento SEFAZ — NF 1234"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Fornecedor</label>
              <input value={form.fornecedor} onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))}
                placeholder="Nome do fornecedor"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Valor (R$)</label>
              <input value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                placeholder="0,00" type="text"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Vencimento</label>
              <input value={form.data_vencimento} onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))}
                type="date"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Observações</label>
              <input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder="Informações adicionais"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {saving ? 'Enviando...' : 'Enviar Solicitação'}
            </button>
            <button type="button" onClick={() => setShowNova(false)}
              className="px-4 py-2 text-gray-400 hover:text-white text-sm rounded-lg transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Lista de solicitações */}
      {loading ? (
        <div className="p-8 text-center text-gray-500 text-sm">Carregando...</div>
      ) : solicitacoes.length === 0 ? (
        <div className="p-8 text-center text-gray-600 text-sm">Nenhuma solicitação enviada</div>
      ) : (
        <div className="divide-y divide-gray-800">
          {solicitacoes.map(s => (
            <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">{s.titulo}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {s.fornecedor ? `${s.fornecedor} · ` : ''}
                  {fmtBRL(s.valor)}
                  {s.data_vencimento ? ` · vence ${fmtDate2(s.data_vencimento)}` : ''}
                </p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLOR_SOL[s.status] ?? 'bg-gray-800 text-gray-400'}`}>
                {STATUS_LABEL_SOL[s.status] ?? s.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface PainelData {
  pendentes_gerente: any[]
  aguardando_fiscal: any[]
  boletos_vencendo:  any[]
  boletos_vencidos:  any[]
  sem_boleto:        any[]
  totais: {
    pendentes_gerente: number
    aguardando_fiscal: number
    boletos_vencendo:  number
    boletos_vencidos:  number
    sem_boleto:        number
  }
}

const STATUS_LABELS: Record<string, string> = {
  pendente_gerente:  'Pendente Gerente',
  nf_rejeitada:      'NF Rejeitada',
  aguardando_fiscal: 'Aguardando Lançamento',
  concluida:         'Concluída',
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

function diasAteVencer(d: string | null) {
  if (!d) return null
  const diff = Math.ceil((new Date(d + 'T12:00:00').getTime() - Date.now()) / 86400000)
  return diff
}

export default function FiscalPainelPage() {
  const { usuario } = useAuthContext()
  const isGerente = usuario?.role === 'gerente'
  const postoIdGerente = usuario?.posto_fechamento_id ?? null

  const [data, setData]       = useState<PainelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [aba, setAba]         = useState<'pendentes' | 'aguardando' | 'boletos'>('pendentes')

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (isGerente && postoIdGerente) params.set('posto_id', postoIdGerente)
      const r = await fetch(`/api/fiscal/painel?${params}`)
      setData(await r.json())
    } finally {
      setLoading(false)
    }
  }, [isGerente, postoIdGerente])

  useEffect(() => { carregar() }, [carregar])

  async function syncAS() {
    setSyncing(true)
    try {
      const r = await fetch('/api/fiscal/sync', { method: 'POST' })
      const result = await r.json()
      if (result.concluidas > 0) {
        alert(`${result.concluidas} tarefa(s) concluída(s) automaticamente!`)
        carregar()
      } else {
        alert('Nenhuma nova NF lançada detectada no AUTOSYSTEM.')
      }
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">Carregando painel fiscal...</div>
  )

  const t = data?.totais

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Painel Fiscal</h1>
          <p className="text-sm text-gray-400 mt-1">Controle de notas fiscais, boletos e lançamentos</p>
        </div>
        <button
          onClick={syncAS}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          Sincronizar com AS
        </button>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-gray-900 border border-yellow-900/40 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Pend. Gerente</p>
          <p className="text-3xl font-bold text-yellow-400 mt-1">{t?.pendentes_gerente ?? 0}</p>
          <p className="text-xs text-gray-500 mt-1">aguardando documentos</p>
        </div>
        <div className="bg-gray-900 border border-blue-900/40 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Fiscal Lançar</p>
          <p className="text-3xl font-bold text-blue-400 mt-1">{t?.aguardando_fiscal ?? 0}</p>
          <p className="text-xs text-gray-500 mt-1">notas a lançar no AS</p>
        </div>
        <div className="bg-gray-900 border border-orange-900/40 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Boletos Vencendo</p>
          <p className="text-3xl font-bold text-orange-400 mt-1">{t?.boletos_vencendo ?? 0}</p>
          <p className="text-xs text-gray-500 mt-1">próximos 7 dias</p>
        </div>
        <div className="bg-gray-900 border border-red-900/40 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Boletos Vencidos</p>
          <p className="text-3xl font-bold text-red-400 mt-1">{t?.boletos_vencidos ?? 0}</p>
          <p className="text-xs text-gray-500 mt-1">em atraso</p>
        </div>
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Sem Boleto</p>
          <p className="text-3xl font-bold text-gray-300 mt-1">{t?.sem_boleto ?? 0}</p>
          <p className="text-xs text-gray-500 mt-1">boleto não informado</p>
        </div>
      </div>

      {/* Abas */}
      <div className="overflow-x-auto pb-0.5">
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-max">
          {[
            { key: 'pendentes', label: 'Pendentes Gerente', count: t?.pendentes_gerente },
            { key: 'aguardando', label: 'Aguardando Fiscal', count: t?.aguardando_fiscal },
            { key: 'boletos', label: 'Boletos', count: (t?.boletos_vencendo ?? 0) + (t?.boletos_vencidos ?? 0) },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setAba(key as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                aba === key ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {label}
              {(count ?? 0) > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Aba: Pendentes Gerente */}
      {aba === 'pendentes' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase">Posto</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase">Fornecedor</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase">Emissão</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-400 uppercase">Valor AS</th>
                <th className="text-center py-3 px-4 text-xs font-medium text-gray-400 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {(data?.pendentes_gerente ?? []).map((t: any) => (
                <tr key={t.id} className="hover:bg-gray-800/30">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-gray-500" />
                      <span className="text-sm text-white">{t.postos?.nome ?? '—'}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-300">{t.fornecedor_nome}</td>
                  <td className="py-3 px-4 text-sm text-gray-400">{fmtDate(t.data_emissao)}</td>
                  <td className="py-3 px-4 text-right text-sm font-mono font-bold text-white">{fmt(t.valor_as)}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      t.status === 'nf_rejeitada'
                        ? 'bg-red-900/40 text-red-400'
                        : 'bg-yellow-900/40 text-yellow-400'
                    }`}>
                      {STATUS_LABELS[t.status]}
                    </span>
                  </td>
                </tr>
              ))}
              {!data?.pendentes_gerente?.length && (
                <tr><td colSpan={5} className="py-8 text-center text-sm text-gray-500">Nenhuma tarefa pendente</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Aba: Aguardando Fiscal */}
      {aba === 'aguardando' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase">Posto</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase">Fornecedor</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase">Emissão</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-400 uppercase">Valor</th>
                <th className="text-center py-3 px-4 text-xs font-medium text-gray-400 uppercase">Venc. Boleto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {(data?.aguardando_fiscal ?? []).map((t: any) => {
                const dias = diasAteVencer(t.boleto_vencimento)
                return (
                  <tr key={t.id} className="hover:bg-gray-800/30">
                    <td className="py-3 px-4 text-sm text-white">{t.postos?.nome ?? '—'}</td>
                    <td className="py-3 px-4 text-sm text-gray-300">{t.fornecedor_nome}</td>
                    <td className="py-3 px-4 text-sm text-gray-400">{fmtDate(t.data_emissao)}</td>
                    <td className="py-3 px-4 text-right text-sm font-mono font-bold text-white">{fmt(t.valor_as)}</td>
                    <td className="py-3 px-4 text-center">
                      {t.boleto_vencimento ? (
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          dias !== null && dias < 0 ? 'bg-red-900/40 text-red-400' :
                          dias !== null && dias <= 7 ? 'bg-orange-900/40 text-orange-400' :
                          'bg-gray-800 text-gray-300'
                        }`}>
                          {fmtDate(t.boleto_vencimento)}
                          {dias !== null && dias < 0 && ` (${Math.abs(dias)}d atraso)`}
                          {dias !== null && dias >= 0 && dias <= 7 && ` (${dias}d)`}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-600">Sem boleto</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {!data?.aguardando_fiscal?.length && (
                <tr><td colSpan={5} className="py-8 text-center text-sm text-gray-500">Nenhuma nota aguardando lançamento</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Aba: Boletos */}
      {aba === 'boletos' && (
        <div className="space-y-4">
          {/* Vencidos */}
          {(data?.boletos_vencidos?.length ?? 0) > 0 && (
            <div>
              <h3 className="text-sm font-medium text-red-400 flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4" /> Boletos Vencidos ({data?.boletos_vencidos.length})
              </h3>
              <div className="bg-gray-900 border border-red-900/30 rounded-xl overflow-hidden">
                <BoletoTable rows={data?.boletos_vencidos ?? []} />
              </div>
            </div>
          )}
          {/* Vencendo em 7 dias */}
          {(data?.boletos_vencendo?.length ?? 0) > 0 && (
            <div>
              <h3 className="text-sm font-medium text-orange-400 flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4" /> Vencendo nos próximos 7 dias ({data?.boletos_vencendo.length})
              </h3>
              <div className="bg-gray-900 border border-orange-900/30 rounded-xl overflow-hidden">
                <BoletoTable rows={data?.boletos_vencendo ?? []} />
              </div>
            </div>
          )}
          {!data?.boletos_vencidos?.length && !data?.boletos_vencendo?.length && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
              <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Nenhum boleto vencido ou vencendo</p>
            </div>
          )}
        </div>
      )}

      {/* Enviar para Contas a Pagar — somente adm_fiscal e master */}
      {!isGerente && <SolicitacoesPagamentoFiscal />}
    </div>
  )
}

function BoletoTable({ rows }: { rows: any[] }) {
  return (
    <div className="overflow-x-auto">
    <table className="w-full">
      <thead>
        <tr className="border-b border-gray-800">
          <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase">Posto</th>
          <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase">Fornecedor</th>
          <th className="text-right py-3 px-4 text-xs font-medium text-gray-400 uppercase">Valor NF</th>
          <th className="text-center py-3 px-4 text-xs font-medium text-gray-400 uppercase">Vencimento</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-800">
        {rows.map((r: any) => {
          const dias = Math.ceil((new Date(r.boleto_vencimento + 'T12:00:00').getTime() - Date.now()) / 86400000)
          return (
            <tr key={r.id} className="hover:bg-gray-800/30">
              <td className="py-3 px-4 text-sm text-white">{r.postos?.nome ?? '—'}</td>
              <td className="py-3 px-4 text-sm text-gray-300">{r.fornecedor_nome}</td>
              <td className="py-3 px-4 text-right text-sm font-mono font-bold text-white">
                {r.valor_as?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </td>
              <td className="py-3 px-4 text-center">
                <div className="flex flex-col items-center">
                  <span className="text-sm text-white">
                    {new Date(r.boleto_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </span>
                  <span className={`text-xs ${dias < 0 ? 'text-red-400' : 'text-orange-400'}`}>
                    {dias < 0 ? `${Math.abs(dias)}d em atraso` : `${dias}d restantes`}
                  </span>
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
    </div>
  )
}
