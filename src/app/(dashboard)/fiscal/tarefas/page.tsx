'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  FileText, CheckCircle2, Clock, XCircle,
  Building2, ChevronDown, ChevronUp,
  RefreshCw, Filter, ThumbsUp, ThumbsDown,
  Loader2, Paperclip, Eye, AlertCircle,
  Package, Plus, Trash2,
} from 'lucide-react'
import { useAuthContext } from '@/contexts/AuthContext'
import { toast } from '@/hooks/use-toast'

// ─── Config de status ─────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pendente_gerente:  { label: 'Pend. Gerente',  color: 'text-yellow-700', bg: 'bg-yellow-100' },
  nf_rejeitada:      { label: 'NF Rejeitada',   color: 'text-red-700',    bg: 'bg-red-100'    },
  aguardando_fiscal: { label: 'Aguard. Fiscal', color: 'text-blue-700',   bg: 'bg-blue-100'   },
  desconhecida:      { label: 'Desconhecida',   color: 'text-orange-700', bg: 'bg-orange-100' },
  concluida:         { label: 'Concluída',       color: 'text-green-700',  bg: 'bg-green-100'  },
}

function fmt(v: number | null | undefined) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

// ─── Item do romaneio ─────────────────────────────────────────────────────────
interface ItemRomaneio {
  numero:          number
  codigo_produto:  string
  descricao:       string
  quantidade:      number
  unidade:         string
  preco_unitario:  number
  valor:           number
  // campos preenchidos pelo gerente
  qtd_unidades:    string
  codigo_interno:  string
  codigo_barras:   string
}

// ─── Botão de foto / upload ────────────────────────────────────────────────────
function BotaoAnexo({
  label, url, nome, uploading, inputRef, onArquivo,
}: {
  label: string
  url: string
  nome: string
  uploading: boolean
  inputRef: React.RefObject<HTMLInputElement>
  onArquivo: (f: File) => void
}) {
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={`w-full flex items-center gap-3 px-3 py-2.5 border-2 border-dashed rounded-xl transition-colors
          ${url
            ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100'
            : 'border-indigo-200 bg-white hover:bg-indigo-50/50'
          }
          disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        {uploading ? (
          <Loader2 className="w-5 h-5 text-indigo-400 animate-spin shrink-0" />
        ) : url ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
        ) : (
          <Paperclip className="w-5 h-5 text-indigo-400 shrink-0" />
        )}
        <div className="flex-1 text-left min-w-0">
          {uploading ? (
            <p className="text-[13px] text-indigo-600 font-medium">Enviando...</p>
          ) : url ? (
            <>
              <p className="text-[13px] text-emerald-700 font-semibold truncate">
                {nome || 'Arquivo enviado'}
              </p>
              <p className="text-[11px] text-emerald-500">Toque para substituir</p>
            </>
          ) : (
            <>
              <p className="text-[13px] text-gray-700 font-medium">{label}</p>
              <p className="text-[11px] text-gray-400">Somente PDF</p>
            </>
          )}
        </div>
        {url && !uploading && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-[11px] text-indigo-600 font-semibold border border-indigo-200 rounded-md px-2 py-0.5 hover:bg-indigo-100 shrink-0"
          >
            Ver
          </a>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) onArquivo(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

// ─── Card de boleto individual ────────────────────────────────────────────────
interface BoletoItem {
  url:       string
  nome:      string
  vencimento: string
  valor:     string
}

function BoletoCard({
  boleto, idx, tarefaId, onChange, onRemove,
}: {
  boleto:   BoletoItem
  idx:      number
  tarefaId: string
  onChange: (idx: number, field: keyof BoletoItem, val: string) => void
  onRemove: (idx: number) => void
}) {
  const inputRef   = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [erro,      setErro]      = useState('')

  async function handleFile(file: File) {
    setUploading(true)
    setErro('')
    const fd = new FormData()
    fd.append('arquivo', file)
    fd.append('tipo', 'boleto')
    const resp = await fetch(`/api/fiscal/tarefas/${tarefaId}/upload`, { method: 'POST', body: fd })
    const json = await resp.json()
    setUploading(false)
    if (!resp.ok) { setErro(json.error ?? 'Erro no upload'); return }
    onChange(idx, 'url',  json.url)
    onChange(idx, 'nome', file.name)
  }

  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-gray-500">Boleto {idx + 1}</p>
        <button type="button" onClick={() => onRemove(idx)} className="text-red-400 hover:text-red-600">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Upload */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={`w-full flex items-center gap-3 px-3 py-2.5 border-2 border-dashed rounded-xl transition-colors
          ${boleto.url ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100' : 'border-indigo-200 bg-white hover:bg-indigo-50/50'}
          disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        {uploading ? (
          <Loader2 className="w-5 h-5 text-indigo-400 animate-spin shrink-0" />
        ) : boleto.url ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
        ) : (
          <Paperclip className="w-5 h-5 text-indigo-400 shrink-0" />
        )}
        <div className="flex-1 text-left min-w-0">
          {uploading ? (
            <p className="text-[13px] text-indigo-600 font-medium">Enviando...</p>
          ) : boleto.url ? (
            <>
              <p className="text-[13px] text-emerald-700 font-semibold truncate">{boleto.nome || 'Arquivo enviado'}</p>
              <p className="text-[11px] text-emerald-500">Toque para substituir</p>
            </>
          ) : (
            <>
              <p className="text-[13px] text-gray-700 font-medium">Anexar PDF do Boleto</p>
              <p className="text-[11px] text-gray-400">Somente PDF</p>
            </>
          )}
        </div>
        {boleto.url && !uploading && (
          <a href={boleto.url} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-[11px] text-indigo-600 font-semibold border border-indigo-200 rounded-md px-2 py-0.5 hover:bg-indigo-100 shrink-0"
          >
            Ver
          </a>
        )}
      </button>
      <input ref={inputRef} type="file" accept="application/pdf" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />

      {erro && <p className="text-[11px] text-red-600">{erro}</p>}

      {/* Vencimento + Valor */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[10px] text-gray-400 mb-1">Vencimento</p>
          <input type="date" value={boleto.vencimento}
            onChange={e => onChange(idx, 'vencimento', e.target.value)}
            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-400/30" />
        </div>
        <div>
          <p className="text-[10px] text-gray-400 mb-1">Valor (R$)</p>
          <input placeholder="0,00" inputMode="decimal" value={boleto.valor}
            onChange={e => onChange(idx, 'valor', e.target.value)}
            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-[12px] font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400/30" />
        </div>
      </div>
    </div>
  )
}

// ─── Dialog Reconheço ─────────────────────────────────────────────────────────
function DialogReconhecer({
  tarefa, onClose, onSucesso,
}: { tarefa: any; onClose: () => void; onSucesso: () => void }) {
  const [nfUrl,        setNfUrl]        = useState(tarefa.nf_url ?? '')
  const [nfNome,       setNfNome]       = useState(tarefa.nf_url ? 'Foto/arquivo já enviado' : '')
  const [nfValor,      setNfValor]      = useState(tarefa.nf_valor_informado ? String(tarefa.nf_valor_informado) : '')
  const [nfUploading,  setNfUploading]  = useState(false)

  // Boletos: array com suporte legado (boleto único antigo)
  const [boletos, setBoletos] = useState<BoletoItem[]>(() => {
    if (tarefa.boletos?.length) {
      return tarefa.boletos.map((b: any) => ({
        url:        b.url        ?? '',
        nome:       b.nome       ?? 'Arquivo enviado',
        vencimento: b.vencimento ?? '',
        valor:      b.valor != null ? String(b.valor) : '',
      }))
    }
    if (tarefa.boleto_url) {
      return [{
        url:        tarefa.boleto_url,
        nome:       'Arquivo enviado',
        vencimento: tarefa.boleto_vencimento ?? '',
        valor:      tarefa.boleto_valor != null ? String(tarefa.boleto_valor) : '',
      }]
    }
    return []
  })

  const [itens,        setItens]        = useState<ItemRomaneio[]>(tarefa.itens_romaneio ?? [])
  const [loadingItens, setLoadingItens] = useState(false)
  const [salvando,     setSalvando]     = useState(false)
  const [erro,         setErro]         = useState('')

  const nfInputRef      = useRef<HTMLInputElement>(null!)
  const itensCarregados = useRef(false)

  useEffect(() => {
    if (itensCarregados.current || itens.length > 0) return
    itensCarregados.current = true
    setLoadingItens(true)
    fetch(`/api/fiscal/tarefas/${tarefa.id}/itens`)
      .then(r => r.json())
      .then(json => {
        if (json.itens?.length) {
          setItens(json.itens.map((it: ItemRomaneio) => ({
            ...it,
            qtd_unidades:   it.qtd_unidades   ?? '',
            codigo_interno: it.codigo_interno  ?? '',
            codigo_barras:  it.codigo_barras   ?? '',
          })))
        }
      })
      .finally(() => setLoadingItens(false))
  }, [tarefa.id, itens.length])

  async function uploadNf(file: File) {
    setNfUploading(true)
    setErro('')
    const fd = new FormData()
    fd.append('arquivo', file)
    fd.append('tipo', 'nf')
    const resp = await fetch(`/api/fiscal/tarefas/${tarefa.id}/upload`, { method: 'POST', body: fd })
    const json = await resp.json()
    setNfUploading(false)
    if (!resp.ok) { setErro(json.error ?? 'Erro no upload'); return }
    setNfUrl(json.url)
    setNfNome(file.name)
  }

  function updateBoleto(idx: number, field: keyof BoletoItem, val: string) {
    setBoletos(prev => prev.map((b, i) => i !== idx ? b : { ...b, [field]: val }))
  }

  function addBoleto() {
    setBoletos(prev => [...prev, { url: '', nome: '', vencimento: '', valor: '' }])
  }

  function removeBoleto(idx: number) {
    setBoletos(prev => prev.filter((_, i) => i !== idx))
  }

  function atualizarItem(idx: number, campo: keyof ItemRomaneio, valor: string) {
    setItens(prev => prev.map((item, i) =>
      i !== idx ? item : { ...item, [campo]: valor }
    ))
  }

  function adicionarItem() {
    setItens(prev => [...prev, {
      numero: prev.length + 1, codigo_produto: '', descricao: '',
      quantidade: 0, unidade: 'UN', preco_unitario: 0, valor: 0,
      qtd_unidades: '', codigo_interno: '', codigo_barras: '',
    }])
  }

  function removerItem(idx: number) {
    setItens(prev => prev.filter((_, i) => i !== idx))
  }

  async function salvar() {
    if (!nfUrl.trim()) return setErro('Fotografe ou anexe o arquivo da NF')
    const valorNf = parseFloat(nfValor.replace(',', '.'))
    if (!valorNf) return setErro('Informe o valor da NF')

    setSalvando(true)
    setErro('')

    const boletosEnvio = boletos
      .filter(b => b.url)
      .map(b => ({
        url:        b.url,
        nome:       b.nome,
        vencimento: b.vencimento || null,
        valor:      parseFloat(b.valor.replace(',', '.')) || null,
      }))

    const resp = await fetch(`/api/fiscal/tarefas/${tarefa.id}/reconhecer`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nf_url:             nfUrl.trim(),
        nf_valor_informado: valorNf,
        boletos:            boletosEnvio,
        itens_romaneio:     itens.length ? itens : null,
      }),
    })
    const json = await resp.json()
    setSalvando(false)

    if (!resp.ok) { setErro(json.error ?? 'Erro ao salvar'); return }

    toast({ title: 'NF reconhecida — enviada para o Fiscal' })
    onSucesso()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <ThumbsUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-[14px] font-bold text-gray-900">Reconheço esta NF</p>
              <p className="text-[11px] text-gray-400 truncate max-w-[280px]">{tarefa.fornecedor_nome}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg font-light">✕</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">

          {/* Info AS */}
          <div className="flex gap-3 text-[12px] bg-gray-50 border border-gray-200 rounded-xl p-3">
            <div><p className="text-gray-400">Valor AS</p><p className="font-bold text-gray-900">{fmt(tarefa.valor_as)}</p></div>
            <div><p className="text-gray-400">Emissão</p><p className="text-gray-800">{fmtDate(tarefa.data_emissao)}</p></div>
            <div><p className="text-gray-400">Posto</p><p className="text-gray-800">{tarefa.postos?.nome ?? '—'}</p></div>
          </div>

          {/* NF */}
          <div className="space-y-2">
            <p className="text-[13px] font-semibold text-gray-800">1. Nota Fiscal</p>
            <BotaoAnexo
              label="Anexar PDF da NF"
              url={nfUrl}
              nome={nfNome}
              uploading={nfUploading}
              inputRef={nfInputRef}
              onArquivo={uploadNf}
            />
            <input
              placeholder={`Valor da NF (AS: ${fmt(tarefa.valor_as)})`}
              value={nfValor}
              onChange={e => setNfValor(e.target.value)}
              inputMode="decimal"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
            />
          </div>

          {/* Boletos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-gray-800">
                2. Boleto(s) <span className="text-gray-400 font-normal">(opcional)</span>
              </p>
              <button type="button" onClick={addBoleto}
                className="text-[11px] text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-medium">
                <Plus className="w-3 h-3" /> Adicionar boleto
              </button>
            </div>

            {boletos.length === 0 && (
              <button type="button" onClick={addBoleto}
                className="w-full flex items-center gap-3 px-3 py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:border-indigo-200 hover:text-indigo-500 transition-colors">
                <Plus className="w-4 h-4 shrink-0" />
                <span className="text-[13px]">Adicionar boleto (opcional)</span>
              </button>
            )}

            {boletos.map((b, idx) => (
              <BoletoCard
                key={idx}
                boleto={b}
                idx={idx}
                tarefaId={tarefa.id}
                onChange={updateBoleto}
                onRemove={removeBoleto}
              />
            ))}
          </div>

          {/* Itens do romaneio */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-gray-800">3. Itens do Romaneio</p>
              <div className="flex items-center gap-2">
                {loadingItens && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                <button
                  onClick={adicionarItem}
                  className="text-[11px] text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Adicionar item
                </button>
              </div>
            </div>

            {itens.length === 0 ? (
              <p className="text-[12px] text-gray-400 italic">
                {loadingItens ? 'Buscando itens no AUTOSYSTEM...' : 'Nenhum item. Adicione manualmente ou o XML não está disponível.'}
              </p>
            ) : (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">Produto</th>
                      <th className="px-2 py-2 text-center text-gray-500 font-medium w-20">Qtd Un.</th>
                      <th className="px-2 py-2 text-left text-gray-500 font-medium w-28">Cód. Interno</th>
                      <th className="px-2 py-2 text-left text-gray-500 font-medium w-32">Cód. Barras</th>
                      <th className="w-7" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {itens.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50">
                        <td className="px-3 py-2 text-gray-800 font-medium leading-tight">
                          {item.descricao || <span className="text-gray-400 italic">sem descrição</span>}
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            inputMode="numeric"
                            placeholder="0"
                            value={item.qtd_unidades}
                            onChange={e => atualizarItem(idx, 'qtd_unidades', e.target.value)}
                            className="w-full px-1.5 py-1 border border-gray-200 focus:border-indigo-400 rounded text-[11px] text-center text-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            placeholder="Ex: 1042"
                            value={item.codigo_interno}
                            onChange={e => atualizarItem(idx, 'codigo_interno', e.target.value)}
                            className="w-full px-1.5 py-1 border border-gray-200 focus:border-indigo-400 rounded text-[11px] text-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            placeholder="Ex: 7891234567890"
                            value={item.codigo_barras}
                            onChange={e => atualizarItem(idx, 'codigo_barras', e.target.value)}
                            className="w-full px-1.5 py-1 border border-gray-200 focus:border-indigo-400 rounded text-[11px] text-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
                          />
                        </td>
                        <td className="px-1 py-1.5 text-center">
                          <button onClick={() => removerItem(idx)} className="text-red-400 hover:text-red-600">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Erro */}
          {erro && (
            <div className="flex items-start gap-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {erro}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 shrink-0 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-200 text-[13px] text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-medium disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Reconhecer e Enviar ao Fiscal
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Dialog Desconheço ────────────────────────────────────────────────────────
function DialogDesconhecer({
  tarefa, onClose, onSucesso,
}: { tarefa: any; onClose: () => void; onSucesso: () => void }) {
  const [salvando, setSalvando] = useState(false)

  async function confirmar() {
    setSalvando(true)
    const resp = await fetch(`/api/fiscal/tarefas/${tarefa.id}/desconhecer`, { method: 'PATCH' })
    setSalvando(false)
    if (!resp.ok) {
      const json = await resp.json()
      toast({ title: json.error ?? 'Erro', variant: 'destructive' })
      return
    }
    toast({ title: 'NF desconhecida — Fiscal será notificado para rejeitar no AS' })
    onSucesso()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
            <ThumbsDown className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <p className="text-[15px] font-bold text-gray-900">Desconheço esta NF</p>
            <p className="text-[12px] text-gray-500">{tarefa.fornecedor_nome}</p>
          </div>
        </div>

        <p className="text-[13px] text-gray-600 bg-orange-50 border border-orange-200 rounded-xl p-3">
          Ao desconhecer, esta tarefa será encerrada e o setor Fiscal receberá alerta
          para registrar o <strong>Desconhecimento</strong> no AUTOSYSTEM.
        </p>

        <div className="flex justify-end gap-3 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-200 text-[13px] text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={salvando}
            className="px-5 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-[13px] font-medium disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Confirmar Desconhecimento
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── TarefaRow ────────────────────────────────────────────────────────────────
function TarefaRow({
  t, isGerente, canFiscal, onAtualizar,
}: { t: any; isGerente: boolean; canFiscal: boolean; onAtualizar: () => void }) {
  const [aberto,            setAberto]            = useState(false)
  const [showReconhecer,    setShowReconhecer]    = useState(false)
  const [showDesconhecer,   setShowDesconhecer]   = useState(false)

  const cfg = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.pendente_gerente

  const podeAgir = isGerente && (t.status === 'pendente_gerente' || t.status === 'nf_rejeitada')
  const jaRespondeu = t.acao_gerente !== null && t.acao_gerente !== undefined

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">

        {/* Cabeçalho */}
        <button
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
          onClick={() => setAberto(!aberto)}
        >
          <div className="flex items-center gap-3 min-w-0">
            <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-sm font-semibold text-gray-900 truncate">{t.postos?.nome ?? '—'}</span>
            <span className="text-sm text-gray-500 truncate hidden sm:block">{t.fornecedor_nome}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-mono font-bold text-gray-900 hidden xs:block">{fmt(t.valor_as)}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.color}`}>
              {cfg.label}
            </span>
            {aberto ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </div>
        </button>

        {/* Detalhes */}
        {aberto && (
          <div className="border-t border-gray-100 p-4 space-y-4">

            {/* Dados principais */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
              <div><p className="text-gray-400">Emissão</p><p className="text-gray-800">{fmtDate(t.data_emissao)}</p></div>
              <div><p className="text-gray-400">Valor AS</p><p className="font-bold text-gray-900">{fmt(t.valor_as)}</p></div>
              <div><p className="text-gray-400">Venc. Boleto</p><p className={t.boleto_vencimento ? 'text-gray-800' : 'text-gray-400'}>{fmtDate(t.boleto_vencimento)}</p></div>
              <div><p className="text-gray-400">Valor Boleto</p><p className={t.boleto_valor ? 'text-gray-800' : 'text-gray-400'}>{fmt(t.boleto_valor)}</p></div>
            </div>

            {/* Documentos anexados */}
            {(t.nf_url || t.boleto_url) && (
              <div className="flex flex-wrap gap-2">
                {t.nf_url && (
                  <a href={t.nf_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-medium hover:bg-indigo-100 transition-colors">
                    <Paperclip className="w-3 h-3" /> NF
                  </a>
                )}
                {t.boleto_url && (
                  <a href={t.boleto_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-medium hover:bg-emerald-100 transition-colors">
                    <Paperclip className="w-3 h-3" /> Boleto
                  </a>
                )}
                {t.romaneio_url && (
                  <a href={t.romaneio_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 border border-purple-200 text-purple-700 text-[11px] font-medium hover:bg-purple-100 transition-colors">
                    <Paperclip className="w-3 h-3" /> Romaneio
                  </a>
                )}
              </div>
            )}

            {/* Itens do romaneio */}
            {t.itens_romaneio?.length > 0 && (
              <div>
                <p className="text-[11px] text-gray-400 font-medium mb-1.5 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" /> Itens do Romaneio ({t.itens_romaneio.length})
                </p>
                <div className="border border-gray-200 rounded-xl overflow-auto max-h-48">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-2 py-1.5 text-left text-gray-500 font-medium">Produto</th>
                        <th className="px-2 py-1.5 text-center text-gray-500 font-medium w-16">Qtd Un.</th>
                        <th className="px-2 py-1.5 text-left text-gray-500 font-medium w-24">Cód. Interno</th>
                        <th className="px-2 py-1.5 text-left text-gray-500 font-medium w-28">Cód. Barras</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {t.itens_romaneio.map((item: ItemRomaneio, i: number) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-800">{item.descricao}</td>
                          <td className="px-2 py-1.5 text-center text-gray-700">{item.qtd_unidades ?? '—'}</td>
                          <td className="px-2 py-1.5 text-gray-600">{item.codigo_interno || '—'}</td>
                          <td className="px-2 py-1.5 text-gray-600 font-mono">{item.codigo_barras || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Status / ação */}
            {t.status === 'concluida' && (
              <div className="flex items-center gap-2 text-[12px] text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Concluída — NF lançada no AUTOSYSTEM em {fmtDate(t.concluida_em?.slice(0, 10))}
              </div>
            )}

            {t.status === 'desconhecida' && (
              <div className="flex items-center gap-2 text-[12px] text-orange-700 bg-orange-50 border border-orange-200 rounded-lg p-3">
                <XCircle className="w-4 h-4 shrink-0" />
                NF desconhecida pelo gerente — Fiscal deve registrar desconhecimento no AS
              </div>
            )}

            {t.status === 'aguardando_fiscal' && (
              <div className="flex items-center gap-2 text-[12px] text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <Clock className="w-4 h-4 shrink-0" />
                Documentos enviados — aguardando lançamento no AUTOSYSTEM pelo Fiscal
              </div>
            )}

            {/* Ações do gerente */}
            {podeAgir && (
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  onClick={() => setShowReconhecer(true)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-medium transition-colors"
                >
                  <ThumbsUp className="w-4 h-4" />
                  Reconheço — Anexar NF + Boleto + Itens
                </button>
                <button
                  onClick={() => setShowDesconhecer(true)}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-800 text-[13px] font-medium transition-colors"
                >
                  <ThumbsDown className="w-4 h-4" />
                  Desconheço
                </button>
              </div>
            )}

            {/* Reabrir se gerente já respondeu mas fiscal ainda não concluiu */}
            {isGerente && jaRespondeu && t.status === 'aguardando_fiscal' && (
              <button
                onClick={() => setShowReconhecer(true)}
                className="text-[12px] text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" /> Visualizar / editar documentos enviados
              </button>
            )}

            {/* Ações adm_fiscal — apenas informativas */}
            {canFiscal && t.status === 'aguardando_fiscal' && (
              <div className="text-[12px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3">
                Lance a NF no AUTOSYSTEM para concluir automaticamente.
              </div>
            )}

            {canFiscal && t.status === 'desconhecida' && (
              <div className="text-[12px] text-orange-700 bg-orange-50 border border-orange-200 rounded-lg p-3">
                Registre o <strong>Desconhecimento</strong> desta NF no AUTOSYSTEM.
              </div>
            )}
          </div>
        )}
      </div>

      {showReconhecer && (
        <DialogReconhecer
          tarefa={t}
          onClose={() => setShowReconhecer(false)}
          onSucesso={() => { setShowReconhecer(false); onAtualizar() }}
        />
      )}
      {showDesconhecer && (
        <DialogDesconhecer
          tarefa={t}
          onClose={() => setShowDesconhecer(false)}
          onSucesso={() => { setShowDesconhecer(false); onAtualizar() }}
        />
      )}
    </>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function FiscalTarefasPage() {
  const { usuario } = useAuthContext()
  const role             = usuario?.role
  const isGerente        = role === 'gerente'
  const canFiscal        = role === 'master' || role === 'adm_fiscal'
  const canView          = canFiscal || isGerente
  const postoIdGerente   = usuario?.posto_fechamento_id ?? null

  const [tarefas,      setTarefas]      = useState<any[]>([])
  const [loading,      setLoading]      = useState(true)
  const [filtroStatus, setFiltroStatus] = useState(isGerente ? 'pendente_gerente' : 'abertas')
  const [filtroPosto,  setFiltroPosto]  = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filtroStatus) params.set('status', filtroStatus)
    const postoFiltro = isGerente ? postoIdGerente : filtroPosto
    if (postoFiltro) params.set('posto_id', postoFiltro)
    const r = await fetch(`/api/fiscal/tarefas?${params}`)
    const json = await r.json()
    setTarefas(Array.isArray(json) ? json : [])
    setLoading(false)
  }, [filtroStatus, filtroPosto, isGerente, postoIdGerente])

  useEffect(() => { carregar() }, [carregar])

  const postos = [...new Map(tarefas.filter(t => t.postos).map(t => [t.posto_id, t.postos])).entries()]
    .map(([id, p]) => ({ id, nome: p.nome }))

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-[13px]">
        Sem permissão para acessar esta página.
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-[15px] md:text-[17px] font-bold text-gray-900 leading-tight">Tarefas Fiscal</h1>
            <p className="text-[11px] text-gray-400 mt-0.5">{tarefas.length} tarefa(s) encontrada(s)</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-gray-400" />

          <select
            value={filtroStatus}
            onChange={e => setFiltroStatus(e.target.value)}
            className="h-8 px-2.5 rounded-lg border border-gray-200 bg-white text-[12px] text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
          >
            {isGerente ? (
              <>
                <option value="pendente_gerente">Aguardando minha resposta</option>
                <option value="aguardando_fiscal">Enviadas ao Fiscal</option>
                <option value="desconhecida">Desconhecidas</option>
                <option value="concluida">Concluídas</option>
                <option value="">Todas</option>
              </>
            ) : (
              <>
                <option value="abertas">Em Aberto</option>
                <option value="pendente_gerente">Pend. Gerente</option>
                <option value="aguardando_fiscal">Aguardando Fiscal</option>
                <option value="desconhecida">Desconhecidas</option>
                <option value="nf_rejeitada">NF Rejeitada</option>
                <option value="concluida">Concluídas</option>
                <option value="">Todas</option>
              </>
            )}
          </select>

          {!isGerente && (
            <select
              value={filtroPosto}
              onChange={e => setFiltroPosto(e.target.value)}
              className="h-8 px-2.5 rounded-lg border border-gray-200 bg-white text-[12px] text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
            >
              <option value="">Todos os postos</option>
              {postos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          )}

          <button
            onClick={carregar}
            disabled={loading}
            className="h-8 px-3 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 text-[12px] font-medium transition-colors shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Instrução para gerente */}
      {isGerente && filtroStatus === 'pendente_gerente' && !loading && tarefas.length > 0 && (
        <div className="flex items-start gap-2.5 text-[12px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          Expanda cada tarefa para escolher: <strong>Reconheço</strong> (anexar NF + boleto + itens) ou <strong>Desconheço</strong> (NF desconhecida).
        </div>
      )}

      {/* Conteúdo */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400 text-[13px] gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando tarefas...
        </div>
      ) : tarefas.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center shadow-sm">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-[14px] font-semibold text-gray-800">Nenhuma tarefa encontrada</p>
          <p className="text-[12px] text-gray-400 mt-1">Tente alterar os filtros</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tarefas.map(t => (
            <TarefaRow
              key={t.id}
              t={t}
              isGerente={isGerente}
              canFiscal={canFiscal}
              onAtualizar={carregar}
            />
          ))}
        </div>
      )}
    </div>
  )
}
