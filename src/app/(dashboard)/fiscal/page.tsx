'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  FileText, AlertCircle, Clock, CheckCircle2,
  Building2, RefreshCw, Send, Loader2, Scale, Filter,
  Paperclip, X,
} from 'lucide-react'
import { useAuthContext } from '@/contexts/AuthContext'
import { toast } from '@/hooks/use-toast'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtBRL(v: number | null) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}
function diasAteVencer(d: string | null) {
  if (!d) return null
  return Math.ceil((new Date(d + 'T12:00:00').getTime() - Date.now()) / 86400000)
}

const STATUS_LABELS: Record<string, string> = {
  pendente_gerente:  'Pendente Gerente',
  nf_rejeitada:      'NF Rejeitada',
  aguardando_fiscal: 'Aguardando Lançamento',
  concluida:         'Concluída',
}

// ─── Dialog: Enviar boleto para Contas a Pagar ────────────────────────────────
interface BoletoParaCP {
  url:        string
  nome:       string
  vencimento: string | null
  valor:      number | null
  fornecedor: string
  tarefaId:   string
}

function DialogEnviarCP({
  boleto, onClose, onSucesso,
}: { boleto: BoletoParaCP; onClose: () => void; onSucesso: () => void }) {
  const [vencimento, setVencimento] = useState(boleto.vencimento ?? '')
  const [valor,      setValor]      = useState(boleto.valor != null ? String(boleto.valor) : '')
  const [salvando,   setSalvando]   = useState(false)

  async function enviar() {
    setSalvando(true)
    const resp = await fetch('/api/solicitacoes-pagamento', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        setor:           'fiscal',
        titulo:          `Boleto — ${boleto.fornecedor}`,
        fornecedor:      boleto.fornecedor,
        valor:           parseFloat(valor.replace(',', '.')) || null,
        data_vencimento: vencimento || null,
        arquivo_url:     boleto.url   || null,
        arquivo_nome:    boleto.nome  || null,
        descricao:       `Boleto fiscal enviado pelo painel. Tarefa: ${boleto.tarefaId}`,
      }),
    })
    setSalvando(false)
    if (resp.ok) {
      toast({ title: 'Boleto enviado para Contas a Pagar!' })
      onSucesso()
    } else {
      const json = await resp.json()
      toast({ variant: 'destructive', title: json.error ?? 'Erro ao enviar' })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <Send className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-[14px] font-bold text-gray-900">Enviar para Contas a Pagar</p>
              <p className="text-[11px] text-gray-400 truncate max-w-[200px]">{boleto.fornecedor}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Arquivo */}
        {boleto.url && (
          <a href={boleto.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-[12px] text-indigo-700 hover:bg-indigo-100 transition-colors">
            <Paperclip className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{boleto.nome || 'Ver boleto'}</span>
          </a>
        )}

        {/* Editar vencimento e valor */}
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Vencimento</label>
            <input type="date" value={vencimento} onChange={e => setVencimento(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-400/30" />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Valor (R$)</label>
            <input placeholder="0,00" inputMode="decimal" value={valor}
              onChange={e => setValor(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-blue-400/30" />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-[13px] text-gray-600 hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button onClick={enviar} disabled={salvando}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[13px] font-medium disabled:opacity-50 transition-colors">
            {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Enviar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── BoletoTable com botão Enviar para CP ─────────────────────────────────────
function BoletoTable({ rows }: { rows: any[] }) {
  const [enviando, setEnviando] = useState<BoletoParaCP | null>(null)

  // Expande cada tarefa em uma linha por boleto
  const linhas = rows.flatMap(tarefa => {
    const lista: any[] = tarefa.boletos?.length
      ? tarefa.boletos
      : tarefa.boleto_url
        ? [{ url: tarefa.boleto_url, nome: 'boleto', vencimento: tarefa.boleto_vencimento, valor: tarefa.boleto_valor }]
        : []
    return lista.map(b => ({ ...b, _tarefa: tarefa }))
  })

  if (!linhas.length) return (
    <div className="p-6 text-center text-gray-400 text-[13px]">Nenhum boleto encontrado</div>
  )

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Posto</th>
              <th className="text-left py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Fornecedor</th>
              <th className="text-right py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Valor</th>
              <th className="text-center py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Vencimento</th>
              <th className="text-center py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Arquivo</th>
              <th className="py-2.5 px-4" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {linhas.map((linha, i) => {
              const dias = linha.vencimento ? diasAteVencer(linha.vencimento) : null
              return (
                <tr key={i} className="hover:bg-gray-50/50">
                  <td className="py-2.5 px-4 text-gray-800">{linha._tarefa.postos?.nome ?? '—'}</td>
                  <td className="py-2.5 px-4 text-gray-600 max-w-[180px] truncate">{linha._tarefa.fornecedor_nome}</td>
                  <td className="py-2.5 px-4 text-right font-mono font-bold text-gray-900">
                    {linha.valor != null ? fmtBRL(linha.valor) : fmtBRL(linha._tarefa.valor_as)}
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    {linha.vencimento ? (
                      <div className="flex flex-col items-center">
                        <span className="text-gray-800">{fmtDate(linha.vencimento)}</span>
                        <span className={`text-[11px] ${dias !== null && dias < 0 ? 'text-red-600' : 'text-orange-500'}`}>
                          {dias !== null && dias < 0 ? `${Math.abs(dias)}d atraso` : `${dias}d restantes`}
                        </span>
                      </div>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    {linha.url ? (
                      <a href={linha.url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-700 font-medium">
                        <Paperclip className="w-3 h-3" /> Ver
                      </a>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <button
                      onClick={() => setEnviando({
                        url:        linha.url        ?? '',
                        nome:       linha.nome       ?? 'boleto',
                        vencimento: linha.vencimento ?? null,
                        valor:      linha.valor      ?? linha._tarefa.valor_as ?? null,
                        fornecedor: linha._tarefa.fornecedor_nome,
                        tarefaId:   linha._tarefa.id,
                      })}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap"
                    >
                      <Send className="w-3 h-3" /> Enviar para CP
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {enviando && (
        <DialogEnviarCP
          boleto={enviando}
          onClose={() => setEnviando(null)}
          onSucesso={() => setEnviando(null)}
        />
      )}
    </>
  )
}

// ─── Interface ────────────────────────────────────────────────────────────────
interface PainelData {
  pendentes_gerente: any[]; aguardando_fiscal: any[]
  boletos_vencendo: any[];  boletos_vencidos: any[]; sem_boleto: any[]
  todos_boletos_anexados: any[]
  totais: {
    pendentes_gerente: number; aguardando_fiscal: number
    boletos_vencendo: number;  boletos_vencidos: number; sem_boleto: number
  }
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function FiscalPainelPage() {
  const { usuario } = useAuthContext()
  const role = usuario?.role
  const isGerente      = role === 'gerente'
  const postoIdGerente = usuario?.posto_fechamento_id ?? null

  const [data,        setData]        = useState<PainelData | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [syncing,     setSyncing]     = useState(false)
  const [filtroPosto, setFiltroPosto] = useState('')
  const [postos,      setPostos]      = useState<{ id: string; nome: string }[]>([])
  const [aba, setAba] = useState<'pendentes' | 'aguardando' | 'boletos'>('pendentes')

  useEffect(() => {
    if (isGerente) return
    fetch('/api/postos').then(r => r.json()).then(j => setPostos(j.postos ?? []))
  }, [isGerente])

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (isGerente && postoIdGerente) params.set('posto_id', postoIdGerente)
      else if (!isGerente && filtroPosto) params.set('posto_id', filtroPosto)
      const r = await fetch(`/api/fiscal/painel?${params}`)
      setData(await r.json())
    } finally {
      setLoading(false)
    }
  }, [isGerente, postoIdGerente, filtroPosto])

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
    <div className="p-4 md:p-6 space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
            <Scale className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-[15px] md:text-[17px] font-bold text-gray-900 leading-tight">Painel Fiscal</h1>
            <p className="text-[11px] text-gray-400 mt-0.5">Controle de notas fiscais, boletos e lançamentos</p>
          </div>
        </div>
        {!isGerente && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div className="relative">
              <Filter className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={filtroPosto}
                onChange={e => setFiltroPosto(e.target.value)}
                className="h-9 pl-8 pr-3 border border-gray-200 rounded-lg text-[13px] text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400/30 appearance-none"
              >
                <option value="">Todos os postos</option>
                {postos.map(p => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>
            <button
              onClick={syncAS}
              disabled={syncing}
              className="h-9 flex items-center gap-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[13px] font-medium transition-colors disabled:opacity-50 shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              Sincronizar com AS
            </button>
          </div>
        )}
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Pend. Gerente',    value: t?.pendentes_gerente ?? 0, sub: 'aguardando documentos', border: 'border-yellow-300', num: 'text-yellow-600' },
          { label: 'Fiscal Lançar',    value: t?.aguardando_fiscal ?? 0, sub: 'notas a lançar no AS',  border: 'border-blue-300',   num: 'text-blue-600' },
          { label: 'Boletos Vencendo', value: t?.boletos_vencendo  ?? 0, sub: 'próximos 7 dias',       border: 'border-orange-300', num: 'text-orange-600' },
          { label: 'Boletos Vencidos', value: t?.boletos_vencidos  ?? 0, sub: 'em atraso',             border: 'border-red-300',    num: 'text-red-600' },
          { label: 'Sem Boleto',       value: t?.sem_boleto        ?? 0, sub: 'boleto não informado',  border: 'border-gray-200',   num: 'text-gray-600' },
        ].map(c => (
          <div key={c.label} className={`bg-white border ${c.border} rounded-xl p-4 shadow-sm`}>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">{c.label}</p>
            <p className={`text-3xl font-bold mt-1 ${c.num}`}>{c.value}</p>
            <p className="text-[11px] text-gray-400 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Abas — sem Contas a Pagar */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { key: 'pendentes',  label: 'Pendentes Gerente', count: t?.pendentes_gerente },
          { key: 'aguardando', label: 'Aguardando Fiscal', count: t?.aguardando_fiscal },
          { key: 'boletos',    label: 'Boletos',           count: (t?.boletos_vencendo ?? 0) + (t?.boletos_vencidos ?? 0) },
        ] as { key: typeof aba; label: string; count: number | null | undefined }[]).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setAba(key)}
            className={`flex items-center gap-2 px-4 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              aba === key ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
            {(count ?? 0) > 0 && (
              <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Aba: Pendentes Gerente ─────────────────────────────────────────── */}
      {aba === 'pendentes' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Posto</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Fornecedor</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Emissão</th>
                  <th className="text-right py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Valor AS</th>
                  <th className="text-center py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(data?.pendentes_gerente ?? []).map((row: any) => (
                  <tr key={row.id} className="hover:bg-gray-50/50">
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-gray-800">{row.postos?.nome ?? '—'}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-gray-600">{row.fornecedor_nome}</td>
                    <td className="py-2.5 px-4 text-gray-500">{fmtDate(row.data_emissao)}</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-gray-900">{fmtBRL(row.valor_as)}</td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        row.status === 'nf_rejeitada' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {STATUS_LABELS[row.status]}
                      </span>
                    </td>
                  </tr>
                ))}
                {!data?.pendentes_gerente?.length && (
                  <tr><td colSpan={5} className="py-8 text-center text-gray-400 text-sm">Nenhuma tarefa pendente</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Aba: Aguardando Fiscal ────────────────────────────────────────── */}
      {aba === 'aguardando' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Posto</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Fornecedor</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Emissão</th>
                  <th className="text-right py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Valor</th>
                  <th className="text-center py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Venc. Boleto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(data?.aguardando_fiscal ?? []).map((row: any) => {
                  const dias = diasAteVencer(row.boleto_vencimento)
                  return (
                    <tr key={row.id} className="hover:bg-gray-50/50">
                      <td className="py-2.5 px-4 text-gray-800">{row.postos?.nome ?? '—'}</td>
                      <td className="py-2.5 px-4 text-gray-600">{row.fornecedor_nome}</td>
                      <td className="py-2.5 px-4 text-gray-500">{fmtDate(row.data_emissao)}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-gray-900">{fmtBRL(row.valor_as)}</td>
                      <td className="py-2.5 px-4 text-center">
                        {row.boleto_vencimento ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            dias !== null && dias < 0   ? 'bg-red-100 text-red-700' :
                            dias !== null && dias <= 7  ? 'bg-orange-100 text-orange-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {fmtDate(row.boleto_vencimento)}
                            {dias !== null && dias < 0 && ` (${Math.abs(dias)}d atraso)`}
                            {dias !== null && dias >= 0 && dias <= 7 && ` (${dias}d)`}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Sem boleto</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {!data?.aguardando_fiscal?.length && (
                  <tr><td colSpan={5} className="py-8 text-center text-gray-400 text-sm">Nenhuma nota aguardando lançamento</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Aba: Boletos ──────────────────────────────────────────────────── */}
      {aba === 'boletos' && (
        <div className="space-y-4">

          {/* Urgentes: vencidos */}
          {(data?.boletos_vencidos?.length ?? 0) > 0 && (
            <div>
              <h3 className="text-[13px] font-medium text-red-600 flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4" /> Vencidos — em atraso ({data!.boletos_vencidos.length})
              </h3>
              <div className="bg-white border border-red-200 rounded-xl overflow-hidden shadow-sm">
                <BoletoTable rows={data!.boletos_vencidos} />
              </div>
            </div>
          )}

          {/* Urgentes: vencendo em 7 dias */}
          {(data?.boletos_vencendo?.length ?? 0) > 0 && (
            <div>
              <h3 className="text-[13px] font-medium text-orange-600 flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4" /> Vencendo nos próximos 7 dias ({data!.boletos_vencendo.length})
              </h3>
              <div className="bg-white border border-orange-200 rounded-xl overflow-hidden shadow-sm">
                <BoletoTable rows={data!.boletos_vencendo} />
              </div>
            </div>
          )}

          {/* Todos os boletos anexados (inclui vencimentos futuros) */}
          {(data?.todos_boletos_anexados?.length ?? 0) > 0 && (
            <div>
              <h3 className="text-[13px] font-medium text-gray-600 flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4" /> Todos os boletos anexados ({data!.todos_boletos_anexados.length})
              </h3>
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <BoletoTable rows={data!.todos_boletos_anexados} />
              </div>
            </div>
          )}

          {/* Vazio */}
          {!data?.boletos_vencidos?.length && !data?.boletos_vencendo?.length && !data?.todos_boletos_anexados?.length && (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center shadow-sm">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-[13px] text-gray-500">Nenhum boleto anexado ainda</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
