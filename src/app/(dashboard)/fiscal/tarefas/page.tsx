'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  FileText, CheckCircle2, Clock, XCircle,
  Building2, ChevronDown, ChevronUp, Paperclip,
} from 'lucide-react'

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pendente_gerente:  { label: 'Pend. Gerente',  color: 'text-yellow-400', bg: 'bg-yellow-900/30' },
  nf_rejeitada:      { label: 'NF Rejeitada',   color: 'text-red-400',    bg: 'bg-red-900/30' },
  aguardando_fiscal: { label: 'Aguard. Fiscal', color: 'text-blue-400',   bg: 'bg-blue-900/30' },
  concluida:         { label: 'Concluída',       color: 'text-green-400',  bg: 'bg-green-900/30' },
}

function fmt(v: number) {
  return v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? '—'
}
function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

function TarefaRow({ t, onAtualizar }: { t: any; onAtualizar: () => void }) {
  const [aberto, setAberto] = useState(false)
  const [nfUrl, setNfUrl]   = useState('')
  const [nfValor, setNfValor] = useState('')
  const [boletoUrl, setBoletoUrl]   = useState('')
  const [boletoVenc, setBoletoVenc] = useState('')
  const [boletoValor, setBoletoValor] = useState('')
  const [romaneioUrl, setRomaneioUrl] = useState('')
  const [salvando, setSalvando] = useState<string | null>(null)

  const cfg = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.pendente_gerente

  async function salvarNf() {
    if (!nfUrl || !nfValor) return alert('Informe a URL e o valor da NF')
    setSalvando('nf')
    const r = await fetch(`/api/fiscal/tarefas/${t.id}/nf`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nf_url: nfUrl, nf_valor_informado: parseFloat(nfValor.replace(',', '.')) }),
    })
    const result = await r.json()
    setSalvando(null)
    if (result.aprovada === false) {
      alert(`NF REJEITADA\n${result.tarefa?.nf_rejeicao_motivo}`)
    } else if (result.aprovada === true) {
      alert('NF aprovada! Valor confere com o manifesto.')
    }
    onAtualizar()
  }

  async function salvarBoleto() {
    if (!boletoUrl || !boletoVenc) return alert('Informe URL e vencimento do boleto')
    setSalvando('boleto')
    await fetch(`/api/fiscal/tarefas/${t.id}/boleto`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boleto_url: boletoUrl, boleto_vencimento: boletoVenc, boleto_valor: parseFloat(boletoValor.replace(',', '.') || '0') }),
    })
    setSalvando(null)
    onAtualizar()
  }

  async function salvarRomaneio() {
    if (!romaneioUrl) return alert('Informe a URL do romaneio')
    setSalvando('romaneio')
    await fetch(`/api/fiscal/tarefas/${t.id}/romaneio`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ romaneio_url: romaneioUrl }),
    })
    setSalvando(null)
    onAtualizar()
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Cabeçalho da tarefa */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/30 transition-colors"
        onClick={() => setAberto(!aberto)}
      >
        <div className="flex items-center gap-4 min-w-0">
          <Building2 className="w-4 h-4 text-gray-500 shrink-0" />
          <span className="text-sm font-medium text-white truncate">{t.postos?.nome ?? '—'}</span>
          <span className="text-sm text-gray-400 truncate hidden sm:block">{t.fornecedor_nome}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-mono font-bold text-white">{fmt(t.valor_as)}</span>
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${cfg.bg} ${cfg.color}`}>
            {cfg.label}
          </span>
          {aberto ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {/* Detalhes expandidos */}
      {aberto && (
        <div className="border-t border-gray-800 p-4 space-y-4">
          {/* Info */}
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><p className="text-gray-500 text-xs">Emissão</p><p className="text-white">{fmtDate(t.data_emissao)}</p></div>
            <div><p className="text-gray-500 text-xs">Valor Manifesto AS</p><p className="text-white font-bold">{fmt(t.valor_as)}</p></div>
            <div><p className="text-gray-500 text-xs">Venc. Boleto</p><p className={t.boleto_vencimento ? 'text-white' : 'text-gray-600'}>{fmtDate(t.boleto_vencimento)}</p></div>
          </div>

          {/* Motivo rejeição */}
          {t.nf_rejeicao_motivo && (
            <div className="flex items-start gap-2 text-sm text-red-400 bg-red-900/20 border border-red-900/40 rounded-lg p-3">
              <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {t.nf_rejeicao_motivo}
            </div>
          )}

          {t.status !== 'concluida' && (
            <div className="grid grid-cols-1 gap-3">
              {/* Etapa 1: NF */}
              <Etapa
                titulo="1. Nota Fiscal"
                concluida={!!t.nf_aprovada}
                rejeitada={t.status === 'nf_rejeitada'}
                link={t.nf_url}
              >
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="URL da NF (PDF / drive)"
                    value={nfUrl}
                    onChange={e => setNfUrl(e.target.value)}
                    className="input-sm"
                  />
                  <input
                    placeholder="Valor da NF (ex: 1234.56)"
                    value={nfValor}
                    onChange={e => setNfValor(e.target.value)}
                    className="input-sm"
                  />
                </div>
                <button onClick={salvarNf} disabled={salvando === 'nf'}
                  className="btn-primary text-xs px-3 py-1.5 mt-2">
                  {salvando === 'nf' ? 'Salvando...' : 'Anexar e Validar NF'}
                </button>
              </Etapa>

              {/* Etapa 2: Boleto */}
              <Etapa
                titulo="2. Boleto"
                concluida={!!t.boleto_url}
                disabled={!t.nf_aprovada}
                link={t.boleto_url}
              >
                <div className="grid grid-cols-3 gap-2">
                  <input placeholder="URL do Boleto" value={boletoUrl} onChange={e => setBoletoUrl(e.target.value)} className="input-sm col-span-2" />
                  <input type="date" value={boletoVenc} onChange={e => setBoletoVenc(e.target.value)} className="input-sm" />
                </div>
                <input placeholder="Valor do boleto" value={boletoValor} onChange={e => setBoletoValor(e.target.value)} className="input-sm mt-2 w-48" />
                <button onClick={salvarBoleto} disabled={salvando === 'boleto' || !t.nf_aprovada}
                  className="btn-primary text-xs px-3 py-1.5 mt-2">
                  {salvando === 'boleto' ? 'Salvando...' : 'Salvar Boleto'}
                </button>
              </Etapa>

              {/* Etapa 3: Romaneio */}
              <Etapa
                titulo="3. Romaneio"
                concluida={!!t.romaneio_url}
                disabled={!t.nf_aprovada}
                link={t.romaneio_url}
              >
                <input placeholder="URL do Romaneio" value={romaneioUrl} onChange={e => setRomaneioUrl(e.target.value)} className="input-sm" />
                <button onClick={salvarRomaneio} disabled={salvando === 'romaneio' || !t.nf_aprovada}
                  className="btn-primary text-xs px-3 py-1.5 mt-2">
                  {salvando === 'romaneio' ? 'Salvando...' : 'Salvar Romaneio'}
                </button>
              </Etapa>
            </div>
          )}

          {t.status === 'concluida' && (
            <div className="flex items-center gap-2 text-green-400 text-sm bg-green-900/20 border border-green-900/40 rounded-lg p-3">
              <CheckCircle2 className="w-4 h-4" />
              Tarefa concluída — NF lançada no AUTOSYSTEM em {fmtDate(t.concluida_em?.slice(0, 10))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Etapa({
  titulo, concluida, rejeitada, disabled, link, children,
}: {
  titulo: string; concluida: boolean; rejeitada?: boolean; disabled?: boolean; link?: string | null; children: React.ReactNode
}) {
  return (
    <div className={`border rounded-lg p-3 space-y-2 ${
      concluida   ? 'border-green-900/40 bg-green-900/10' :
      rejeitada   ? 'border-red-900/40 bg-red-900/10' :
      disabled    ? 'border-gray-800 opacity-50' :
      'border-gray-700'
    }`}>
      <div className="flex items-center gap-2">
        {concluida
          ? <CheckCircle2 className="w-4 h-4 text-green-400" />
          : rejeitada
            ? <XCircle className="w-4 h-4 text-red-400" />
            : <Clock className="w-4 h-4 text-gray-500" />
        }
        <span className="text-sm font-medium text-white">{titulo}</span>
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:underline flex items-center gap-1 ml-auto">
            <Paperclip className="w-3 h-3" /> Ver arquivo
          </a>
        )}
      </div>
      {!disabled && !concluida && children}
    </div>
  )
}

export default function FiscalTarefasPage() {
  const [tarefas, setTarefas]   = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroPosto, setFiltroPosto]   = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filtroStatus) params.set('status', filtroStatus)
    if (filtroPosto)  params.set('posto_id', filtroPosto)
    const r = await fetch(`/api/fiscal/tarefas?${params}`)
    setTarefas(await r.json())
    setLoading(false)
  }, [filtroStatus, filtroPosto])

  useEffect(() => { carregar() }, [carregar])

  const postos = [...new Map(tarefas.filter(t => t.postos).map(t => [t.posto_id, t.postos])).entries()]
    .map(([id, p]) => ({ id, nome: p.nome }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Tarefas Fiscal</h1>
          <p className="text-sm text-gray-400 mt-1">{tarefas.length} tarefa(s) encontrada(s)</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <select
          value={filtroStatus}
          onChange={e => setFiltroStatus(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todos os status</option>
          <option value="pendente_gerente">Pendente Gerente</option>
          <option value="nf_rejeitada">NF Rejeitada</option>
          <option value="aguardando_fiscal">Aguardando Fiscal</option>
          <option value="concluida">Concluídas</option>
        </select>
        <select
          value={filtroPosto}
          onChange={e => setFiltroPosto(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todos os postos</option>
          {postos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando tarefas...</div>
      ) : tarefas.length === 0 ? (
        <div className="text-center py-12 text-gray-500">Nenhuma tarefa encontrada</div>
      ) : (
        <div className="space-y-2">
          {tarefas.map(t => (
            <TarefaRow key={t.id} t={t} onAtualizar={carregar} />
          ))}
        </div>
      )}
    </div>
  )
}
