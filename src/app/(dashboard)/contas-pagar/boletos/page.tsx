'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils/cn'
import {
  Inbox, Loader2, CheckCircle2, RefreshCw, Eye, CheckCheck,
  XCircle, AlertCircle, IndentIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Solicitacao {
  id: string
  titulo: string
  setor: string
  fornecedor: string | null
  valor: number | null
  data_vencimento: string | null
  status: string
  criado_por_nome: string | null
  criado_em: string
  observacoes: string | null
  descricao: string | null
  motivo_rejeicao: string | null
  arquivo_url: string | null
  arquivo_nome: string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SETOR_COLOR: Record<string, string> = {
  fiscal:      'bg-indigo-100 text-indigo-700 border-indigo-200',
  marketing:   'bg-pink-100 text-pink-700 border-pink-200',
  transpombal: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  outro:       'bg-gray-100 text-gray-600 border-gray-200',
}
const SETOR_LABEL: Record<string, string> = {
  fiscal: 'Fiscal', marketing: 'Marketing', transpombal: 'Transpombal', outro: 'Outro',
}
const STATUS_COLOR: Record<string, string> = {
  pendente:   'bg-yellow-100 text-yellow-700',
  em_analise: 'bg-blue-100 text-blue-700',
  aprovado:   'bg-emerald-100 text-emerald-700',
  pago:       'bg-green-100 text-green-700',
  rejeitado:  'bg-red-100 text-red-700',
}
const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente', em_analise: 'Em Análise', aprovado: 'Aprovado',
  pago: 'Pago', rejeitado: 'Rejeitado',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtBRL(v: number | null) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}
function fmtDatetime(d: string) {
  return new Date(d).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Filtros de status ─────────────────────────────────────────────────────────

const FILTROS = [
  { key: 'pendente',   label: 'Pendentes'  },
  { key: 'em_analise', label: 'Em Análise' },
  { key: 'aprovado',   label: 'Aprovados'  },
  { key: 'pago',       label: 'Pagos'      },
  { key: 'rejeitado',  label: 'Rejeitados' },
  { key: 'todos',      label: 'Todos'      },
]

const FILTROS_SETOR = [
  { key: 'todos',      label: 'Todos'      },
  { key: 'fiscal',     label: 'Fiscal'     },
  { key: 'marketing',  label: 'Marketing'  },
  { key: 'transpombal', label: 'Transpombal' },
  { key: 'outro',      label: 'Outro'      },
]

// ── Componente principal ───────────────────────────────────────────────────────

export default function BoletosPage() {
  const [solicitacoes,  setSolicitacoes]  = useState<Solicitacao[]>([])
  const [loading,       setLoading]       = useState(true)
  const [filtroStatus,  setFiltroStatus]  = useState('pendente')
  const [filtroSetor,   setFiltroSetor]   = useState('todos')
  const [detalhes,      setDetalhes]      = useState<string | null>(null)
  const [atualizando,   setAtualizando]   = useState<string | null>(null)
  const [idRejeitar,    setIdRejeitar]    = useState<string | null>(null)
  const [motivoRej,     setMotivoRej]     = useState('')

  async function carregar() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filtroStatus !== 'todos') params.set('status', filtroStatus)
    if (filtroSetor  !== 'todos') params.set('setor',  filtroSetor)
    const r = await fetch(`/api/solicitacoes-pagamento?${params}`)
    const json = await r.json()
    setSolicitacoes(json.solicitacoes ?? [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [filtroStatus, filtroSetor])

  async function mudarStatus(id: string, status: string, motivo?: string) {
    setAtualizando(id)
    const r = await fetch('/api/solicitacoes-pagamento', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, motivo_rejeicao: motivo }),
    })
    if (r.ok) {
      toast({ title: `Marcado como "${STATUS_LABEL[status]}"` })
      carregar()
    } else {
      toast({ variant: 'destructive', title: 'Erro ao atualizar' })
    }
    setAtualizando(null)
    setIdRejeitar(null)
    setMotivoRej('')
  }

  const pendentes = solicitacoes.filter(s => s.status === 'pendente').length

  return (
    <div className="animate-fade-in">
      <Header
        title="Boletos e Solicitações"
        description="Solicitações de pagamento recebidas do Fiscal e Marketing"
        actions={
          <Button variant="outline" size="sm" onClick={carregar} disabled={loading} className="gap-1.5 text-[13px]">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            Atualizar
          </Button>
        }
      />

      <div className="p-3 md:p-6 space-y-4">

        {/* ── Filtros ── */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Status */}
          <div className="flex gap-1 flex-wrap">
            {FILTROS.map(f => (
              <button
                key={f.key}
                onClick={() => setFiltroStatus(f.key)}
                className={cn(
                  'text-[12px] px-3 py-1.5 rounded-lg font-medium transition-colors',
                  filtroStatus === f.key
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50',
                )}
              >
                {f.label}
                {f.key === 'pendente' && pendentes > 0 && filtroStatus !== 'pendente' && (
                  <span className="ml-1.5 bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {pendentes}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Setor */}
          <div className="flex gap-1 flex-wrap sm:ml-auto">
            {FILTROS_SETOR.map(f => (
              <button
                key={f.key}
                onClick={() => setFiltroSetor(f.key)}
                className={cn(
                  'text-[11px] px-2.5 py-1.5 rounded-lg font-medium transition-colors',
                  filtroSetor === f.key
                    ? 'bg-gray-800 text-white'
                    : 'bg-white border border-gray-200 text-gray-400 hover:bg-gray-50',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Lista ── */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-[13px]">Carregando solicitações...</span>
          </div>
        ) : solicitacoes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
            <CheckCircle2 className="w-10 h-10 opacity-30" />
            <p className="text-[13px]">
              Nenhuma solicitação {filtroStatus !== 'todos' ? `com status "${STATUS_LABEL[filtroStatus]}"` : ''}
              {filtroSetor !== 'todos' ? ` do setor ${SETOR_LABEL[filtroSetor]}` : ''}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {solicitacoes.map(s => {
              const isOpen = detalhes === s.id
              return (
                <div key={s.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  {/* Linha principal */}
                  <div className="px-4 py-3 flex items-start gap-3">
                    {/* Ícone setor */}
                    <div className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-[11px] font-bold border',
                      SETOR_COLOR[s.setor] ?? 'bg-gray-100 text-gray-600 border-gray-200',
                    )}>
                      {(SETOR_LABEL[s.setor] ?? s.setor).slice(0, 2).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className={cn(
                          'text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide border',
                          SETOR_COLOR[s.setor] ?? 'bg-gray-100 text-gray-600 border-gray-200',
                        )}>
                          {SETOR_LABEL[s.setor] ?? s.setor}
                        </span>
                        <span className={cn(
                          'text-[10px] px-2 py-0.5 rounded-full font-medium',
                          STATUS_COLOR[s.status] ?? 'bg-gray-100 text-gray-500',
                        )}>
                          {STATUS_LABEL[s.status] ?? s.status}
                        </span>
                        {s.data_vencimento && new Date(s.data_vencimento) < new Date() && s.status !== 'pago' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-600 flex items-center gap-1">
                            <AlertCircle className="w-2.5 h-2.5" /> Vencido
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] font-semibold text-gray-800 truncate">{s.titulo}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {s.fornecedor ? <span>{s.fornecedor} · </span> : null}
                        <span className="font-semibold text-gray-700">{fmtBRL(s.valor)}</span>
                        {s.data_vencimento ? <span> · vence {fmtDate(s.data_vencimento)}</span> : null}
                        {s.criado_por_nome ? <span className="text-gray-400"> · por {s.criado_por_nome}</span> : null}
                        <span className="text-gray-300"> · {fmtDatetime(s.criado_em)}</span>
                      </p>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setDetalhes(isOpen ? null : s.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                        title="Ver detalhes"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      {s.status === 'pendente' && (
                        <button
                          onClick={() => mudarStatus(s.id, 'em_analise')}
                          disabled={atualizando === s.id}
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium transition-colors whitespace-nowrap"
                        >
                          Analisar
                        </button>
                      )}

                      {(s.status === 'pendente' || s.status === 'em_analise') && (
                        <>
                          <button
                            onClick={() => mudarStatus(s.id, 'aprovado')}
                            disabled={atualizando === s.id}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                            title="Aprovar"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setIdRejeitar(s.id)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Rejeitar"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}

                      {s.status === 'aprovado' && (
                        <button
                          onClick={() => mudarStatus(s.id, 'pago')}
                          disabled={atualizando === s.id}
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium transition-colors whitespace-nowrap"
                        >
                          Marcar Pago
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Detalhes expandidos */}
                  {isOpen && (
                    <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/60 space-y-2">
                      {(s.descricao || s.observacoes) && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Descrição / Observações</p>
                          <p className="text-[12px] text-gray-600 leading-relaxed">
                            {s.descricao || s.observacoes}
                          </p>
                        </div>
                      )}
                      {s.motivo_rejeicao && (
                        <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                          <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide mb-0.5">Motivo da rejeição</p>
                            <p className="text-[12px] text-red-700">{s.motivo_rejeicao}</p>
                          </div>
                        </div>
                      )}
                      {s.arquivo_url && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Arquivo</p>
                          <a
                            href={s.arquivo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-[12px] text-blue-600 hover:underline"
                          >
                            <IndentIcon className="w-3.5 h-3.5" />
                            {s.arquivo_nome ?? 'Ver arquivo'}
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Campo de rejeição */}
                  {idRejeitar === s.id && (
                    <div className="border-t border-gray-100 px-4 py-3 bg-red-50/40 flex gap-2 flex-wrap">
                      <input
                        value={motivoRej}
                        onChange={e => setMotivoRej(e.target.value)}
                        placeholder="Motivo da rejeição (opcional)"
                        className="flex-1 min-w-[200px] px-3 py-1.5 border border-gray-200 rounded-lg text-[12px] bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20"
                      />
                      <button
                        onClick={() => mudarStatus(s.id, 'rejeitado', motivoRej)}
                        className="px-3 py-1.5 bg-red-500 text-white text-[12px] rounded-lg hover:bg-red-600 font-medium"
                      >
                        Confirmar
                      </button>
                      <button
                        onClick={() => { setIdRejeitar(null); setMotivoRej('') }}
                        className="px-3 py-1.5 text-gray-500 text-[12px] rounded-lg hover:bg-gray-100"
                      >
                        Cancelar
                      </button>
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
