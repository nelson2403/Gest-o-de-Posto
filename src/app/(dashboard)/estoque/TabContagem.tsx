'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils/cn'
import { formatCurrency } from '@/lib/utils/formatters'
import {
  ClipboardCheck, Search, Save, Printer, ChevronDown, ChevronRight,
  Loader2, Package, AlertTriangle, History, Plus, Eye,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface PostoOpt { id: string; nome: string; codigo_empresa_externo: string | null; empresa_id: string }
interface Grupo { id: string; codigo: number; nome: string }

interface ProdutoContagem {
  produto:      number
  produto_nome: string
  unid_med:     string
  estoque:      number
  custo_medio:  number
  valor_total:  number
  qtd_contada:  string
}

interface ContagemSalva {
  id: string
  posto_nome: string
  grupo_nome: string
  grupo_id: string
  data_contagem: string
  criado_em: string
  codigo_empresa_externo: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtQtd(v: number, unid: string) {
  const n = v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
  return `${n} ${unid}`
}

function fmtDiff(contada: number, sistema: number, unid: string) {
  const diff = contada - sistema
  if (diff === 0) return <span className="text-gray-400 text-[12px]">0 {unid}</span>
  return (
    <span className={cn('text-[12px] font-semibold', diff > 0 ? 'text-green-600' : 'text-red-600')}>
      {diff > 0 ? '+' : ''}{fmtQtd(diff, unid)}
    </span>
  )
}

function printContagem(
  postoNome: string, grupoNome: string, dataContagem: string,
  produtos: ProdutoContagem[],
) {
  const dataFmt = new Date(dataContagem + 'T12:00:00').toLocaleDateString('pt-BR')
  const rows = produtos.map((p, i) => {
    const contada = parseFloat(p.qtd_contada) || 0
    const diff = p.qtd_contada !== '' ? contada - p.estoque : null
    return `
      <tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:6px 8px;text-align:center;color:#6b7280;font-size:11px">${i + 1}</td>
        <td style="padding:6px 8px;font-size:12px;font-weight:500">${p.produto_nome}</td>
        <td style="padding:6px 8px;text-align:center;font-size:12px;color:#6b7280">${p.unid_med}</td>
        <td style="padding:6px 8px;text-align:right;font-size:12px">${p.estoque.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</td>
        <td style="padding:6px 8px;text-align:right;font-size:12px;font-weight:600">${p.qtd_contada !== '' ? contada.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '—'}</td>
        <td style="padding:6px 8px;text-align:right;font-size:12px;font-weight:600;color:${diff == null ? '#9ca3af' : diff > 0 ? '#16a34a' : diff < 0 ? '#dc2626' : '#6b7280'}">
          ${diff == null ? '—' : (diff >= 0 ? '+' : '') + diff.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) + ' ' + p.unid_med}
        </td>
        <td style="padding:6px 8px;text-align:right;font-size:11px;color:#9ca3af">${p.custo_medio > 0 ? formatCurrency(p.custo_medio) : '—'}</td>
      </tr>`
  }).join('')

  const totalSistema = produtos.reduce((s, p) => s + p.estoque, 0)
  const totalValor = produtos.reduce((s, p) => s + p.valor_total, 0)

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Contagem de Estoque — ${postoNome}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 20px; color: #111 }
      h1 { font-size: 18px; margin: 0 0 4px } h2 { font-size: 13px; color: #6b7280; font-weight: normal; margin: 0 0 16px }
      table { width: 100%; border-collapse: collapse }
      th { background: #f3f4f6; padding: 7px 8px; font-size: 11px; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #e5e7eb }
      .footer { margin-top: 24px; display: flex; gap: 40px }
      .assinatura { border-top: 1px solid #374151; padding-top: 4px; font-size: 11px; color: #6b7280; min-width: 180px }
      @media print { button { display: none } }
    </style></head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
      <div>
        <h1>Contagem de Estoque</h1>
        <h2>${postoNome} · ${grupoNome} · ${dataFmt}</h2>
      </div>
      <div style="text-align:right;font-size:11px;color:#6b7280">
        <div>${produtos.length} produto(s) listados</div>
        <div>Valor em sistema: ${formatCurrency(totalValor)}</div>
      </div>
    </div>
    <table>
      <thead><tr>
        <th style="width:32px">#</th>
        <th style="text-align:left">Produto</th>
        <th>Unid</th>
        <th style="text-align:right">Qtd Sistema</th>
        <th style="text-align:right">Qtd Contada</th>
        <th style="text-align:right">Diferença</th>
        <th style="text-align:right">Custo Unit.</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:12px;padding:8px;background:#f9fafb;border-radius:6px;font-size:12px;display:flex;gap:24px">
      <span>Total produtos: <strong>${produtos.length}</strong></span>
      <span>Total sistema: <strong>${totalSistema.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</strong></span>
      <span>Valor total sistema: <strong>${formatCurrency(totalValor)}</strong></span>
    </div>
    <div class="footer">
      <div class="assinatura">Responsável pela contagem</div>
      <div class="assinatura">Supervisor</div>
      <div class="assinatura">Data: ${dataFmt}</div>
    </div>
    <script>window.onload=()=>window.print()</script>
  </body></html>`

  const w = window.open('', '_blank')
  if (w) { w.document.write(html); w.document.close() }
}

// ── Sub-view: Nova Contagem ────────────────────────────────────────────────────

function NovaContagem({ postos, grupos, onSaved }: {
  postos: PostoOpt[]
  grupos: Grupo[]
  onSaved: () => void
}) {
  const supabase = createClient()
  const [postoId,       setPostoId]       = useState('')
  const [grupoId,       setGrupoId]       = useState('')
  const [dataContagem,  setDataContagem]  = useState(new Date().toISOString().slice(0, 10))
  const [produtos,      setProdutos]      = useState<ProdutoContagem[]>([])
  const [loading,       setLoading]       = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [busca,         setBusca]         = useState('')
  const [filtroEstoque, setFiltroEstoque] = useState<'todos' | 'zerados' | 'com_estoque'>('todos')
  const [saved,         setSaved]         = useState<{ id: string; posto: string; grupo: string } | null>(null)

  const posto = postos.find(p => p.id === postoId)
  const grupo = grupos.find(g => g.id === grupoId)

  const produtosFiltrados = produtos
    .filter(p => filtroEstoque === 'zerados' ? p.estoque === 0 : filtroEstoque === 'com_estoque' ? p.estoque > 0 : true)
    .filter(p => busca.trim() ? p.produto_nome.toLowerCase().includes(busca.toLowerCase()) : true)

  async function carregar() {
    if (!posto?.codigo_empresa_externo || !grupoId) return
    setLoading(true)
    setSaved(null)
    setProdutos([])
    try {
      const res = await fetch(`/api/estoque/contagem-produtos?empresaId=${posto.codigo_empresa_externo}&grupoId=${grupoId}`)
      const json = await res.json()
      if (!res.ok) { toast({ variant: 'destructive', title: 'Erro', description: json.error }); return }
      setProdutos((json.produtos ?? []).map((p: any) => ({ ...p, qtd_contada: '' })))
    } finally { setLoading(false) }
  }

  function setQtd(produtoId: number, val: string) {
    setProdutos(prev => prev.map(p => p.produto === produtoId ? { ...p, qtd_contada: val } : p))
  }

  async function salvar() {
    if (!posto || !grupo || !produtos.length) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: usuario } = await supabase.from('usuarios').select('empresa_id').eq('id', user!.id).single()

      const res = await fetch('/api/estoque/contagens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_id: usuario?.empresa_id ?? posto.empresa_id,
          codigo_empresa_externo: posto.codigo_empresa_externo,
          posto_nome: posto.nome,
          grupo_id: grupoId,
          grupo_nome: grupo.nome,
          data_contagem: dataContagem,
          itens: produtos.map(p => ({
            produto_id:  p.produto,
            produto_nome: p.produto_nome,
            unid_med:    p.unid_med,
            qtd_sistema: p.estoque,
            custo_medio: p.custo_medio,
            qtd_contada: p.qtd_contada !== '' ? parseFloat(p.qtd_contada) : null,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast({ variant: 'destructive', title: 'Erro', description: json.error }); return }
      setSaved({ id: json.id, posto: posto.nome, grupo: grupo.nome })
      onSaved()
      toast({ title: 'Contagem salva com sucesso!' })
    } finally { setSaving(false) }
  }

  const totalContados = produtos.filter(p => p.qtd_contada !== '').length
  const totalDiverg   = produtos.filter(p => {
    if (p.qtd_contada === '') return false
    return Math.abs(parseFloat(p.qtd_contada) - p.estoque) > 0.001
  }).length

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-3">
          {/* Posto */}
          <div className="flex flex-col gap-1 min-w-[180px] flex-1">
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Posto</label>
            <select value={postoId} onChange={e => { setPostoId(e.target.value); setProdutos([]); setSaved(null) }}
              className="h-9 px-3 rounded-lg border border-gray-200 text-[13px] bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30">
              <option value="">Selecione o posto...</option>
              {postos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          {/* Grupo */}
          <div className="flex flex-col gap-1 min-w-[180px] flex-1">
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Grupo de Produto</label>
            <select value={grupoId} onChange={e => { setGrupoId(e.target.value); setProdutos([]); setSaved(null) }}
              className="h-9 px-3 rounded-lg border border-gray-200 text-[13px] bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30">
              <option value="">Selecione o grupo...</option>
              {grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
            </select>
          </div>
          {/* Data */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Data da Contagem</label>
            <input type="date" value={dataContagem} onChange={e => setDataContagem(e.target.value)}
              className="h-9 px-3 rounded-lg border border-gray-200 text-[13px] bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30" />
          </div>
          {/* Carregar */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-transparent select-none uppercase">.</label>
            <button onClick={carregar} disabled={!postoId || !grupoId || loading}
              className="h-9 px-5 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[13px] font-semibold transition-colors flex items-center gap-2 shadow-sm">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardCheck className="w-3.5 h-3.5" />}
              Carregar Produtos
            </button>
          </div>
        </div>
      </div>

      {/* Tabela de produtos */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-[13px]">Carregando produtos do AUTOSYSTEM...</span>
        </div>
      )}

      {!loading && produtos.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Header da tabela */}
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <ClipboardCheck className="w-4 h-4 text-orange-500" />
              <div>
                <p className="text-[13px] font-semibold text-gray-700">
                  {posto?.nome} · {grupo?.nome}
                </p>
                <p className="text-[11px] text-gray-400">
                  {produtos.length} produto{produtos.length !== 1 ? 's' : ''} — {totalContados} preenchido{totalContados !== 1 ? 's' : ''}
                  {totalDiverg > 0 && (
                    <span className="ml-2 text-red-500 font-medium">
                      · {totalDiverg} divergência{totalDiverg !== 1 ? 's' : ''}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Filtro estoque */}
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[11px] font-medium">
                {([
                  { key: 'todos',       label: 'Todos' },
                  { key: 'com_estoque', label: 'Com estoque' },
                  { key: 'zerados',     label: 'Zerados' },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setFiltroEstoque(key)}
                    className={cn(
                      'px-2.5 py-1.5 transition-colors',
                      filtroEstoque === key
                        ? key === 'zerados' ? 'bg-red-500 text-white' : key === 'com_estoque' ? 'bg-green-500 text-white' : 'bg-gray-600 text-white'
                        : 'bg-white text-gray-500 hover:bg-gray-50',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* Busca */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input type="text" placeholder="Filtrar produto..." value={busca}
                  onChange={e => setBusca(e.target.value)}
                  className="h-8 pl-8 pr-3 w-[160px] rounded-lg border border-gray-200 text-[12px] bg-white focus:outline-none focus:ring-2 focus:ring-orange-400/30" />
              </div>
            </div>
          </div>

          {/* Tabela */}
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-[11px] uppercase tracking-wide">Produto</th>
                  <th className="px-4 py-2.5 text-center font-medium text-gray-500 text-[11px] uppercase tracking-wide w-16">Unid</th>
                  <th className="px-4 py-2.5 text-right font-medium text-gray-500 text-[11px] uppercase tracking-wide w-32">Qtd Sistema</th>
                  <th className="px-4 py-2.5 text-right font-medium text-gray-500 text-[11px] uppercase tracking-wide w-32">Valor Sistema</th>
                  <th className="px-4 py-2.5 text-center font-medium text-orange-500 text-[11px] uppercase tracking-wide w-36">Qtd Contada</th>
                  <th className="px-4 py-2.5 text-right font-medium text-gray-500 text-[11px] uppercase tracking-wide w-28">Diferença</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {produtosFiltrados.map((p, idx) => {
                  const contada = p.qtd_contada !== '' ? parseFloat(p.qtd_contada) : null
                  const temDiverg = contada != null && Math.abs(contada - p.estoque) > 0.001
                  return (
                    <tr key={p.produto} className={cn('hover:bg-orange-50/20 transition-colors', temDiverg && 'bg-red-50/30')}>
                      <td className="px-4 py-2 text-gray-800 font-medium">
                        <div className="flex items-center gap-2">
                          {temDiverg && <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                          <span className="text-[12px] leading-snug">{p.produto_nome}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-center text-gray-500 text-[12px]">{p.unid_med}</td>
                      <td className="px-4 py-2 text-right text-gray-700 tabular-nums text-[12px]">
                        {p.estoque.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-400 tabular-nums text-[11px]">
                        {p.custo_medio > 0 ? formatCurrency(p.valor_total) : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={p.qtd_contada}
                          onChange={e => setQtd(p.produto, e.target.value)}
                          placeholder="—"
                          className={cn(
                            'w-full h-8 px-2 text-right rounded-lg border text-[13px] font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-400/40 transition-colors',
                            contada == null ? 'border-gray-200 bg-white text-gray-600'
                              : temDiverg ? 'border-red-300 bg-red-50 text-red-700'
                              : 'border-green-300 bg-green-50 text-green-700',
                          )}
                        />
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {contada != null ? fmtDiff(contada, p.estoque, p.unid_med) : <span className="text-gray-300 text-[12px]">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {/* Rodapé totais */}
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wide" colSpan={2}>
                    Total ({produtosFiltrados.length} itens)
                  </td>
                  <td className="px-4 py-2.5 text-right text-[12px] font-bold text-gray-700 tabular-nums">
                    {produtosFiltrados.reduce((s, p) => s + p.estoque, 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 tabular-nums">
                    {formatCurrency(produtosFiltrados.reduce((s, p) => s + p.valor_total, 0))}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[12px] font-bold text-orange-600 tabular-nums">
                    {(() => {
                      const tot = produtosFiltrados.reduce((s, p) => p.qtd_contada !== '' ? s + parseFloat(p.qtd_contada) : s, 0)
                      return tot > 0 ? tot.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '—'
                    })()}
                  </td>
                  <td className="px-4 py-2.5" />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Ações */}
          <div className="px-4 py-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] text-gray-400">
              {totalContados > 0
                ? `${totalContados} de ${produtos.length} produtos preenchidos`
                : 'Preencha as quantidades contadas para salvar'}
            </p>
            <div className="flex gap-2">
              {saved && (
                <button
                  onClick={() => printContagem(posto!.nome, grupo!.nome, dataContagem, produtos)}
                  className="h-9 px-4 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-[13px] font-medium flex items-center gap-2 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimir
                </button>
              )}
              <button
                onClick={salvar}
                disabled={saving || totalContados === 0}
                className="h-9 px-5 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[13px] font-semibold flex items-center gap-2 transition-colors shadow-sm"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Salvar Contagem
              </button>
            </div>
          </div>

          {saved && (
            <div className="px-4 py-2.5 bg-green-50 border-t border-green-200 flex items-center gap-2 text-[12px] text-green-700">
              <ClipboardCheck className="w-4 h-4 flex-shrink-0" />
              Contagem salva! Clique em <strong>Imprimir</strong> para gerar o relatório, ou faça uma nova contagem.
            </div>
          )}
        </div>
      )}

      {!loading && !produtos.length && postoId && grupoId && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
          <Package className="w-8 h-8 opacity-30" />
          <p className="text-[13px]">Clique em <strong>Carregar Produtos</strong> para iniciar a contagem</p>
        </div>
      )}

      {!loading && !postoId && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
          <ClipboardCheck className="w-8 h-8 opacity-30" />
          <p className="text-[13px]">Selecione o posto e o grupo para iniciar a contagem</p>
        </div>
      )}
    </div>
  )
}

// ── Sub-view: Histórico ────────────────────────────────────────────────────────

function Historico({ grupos, refresh }: { grupos: Grupo[]; refresh: number }) {
  const [contagens, setContagens] = useState<ContagemSalva[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<Record<string, any>>({})
  const [loadingDetalhe, setLoadingDetalhe] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/estoque/contagens?limit=30')
      const json = await res.json()
      setContagens(json.contagens ?? [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { carregar() }, [carregar, refresh])

  async function expandir(id: string) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (detalhe[id]) return
    setLoadingDetalhe(id)
    try {
      const res = await fetch(`/api/estoque/contagens/${id}`)
      const json = await res.json()
      setDetalhe(prev => ({ ...prev, [id]: json.contagem }))
    } finally { setLoadingDetalhe(null) }
  }

  function imprimir(contagem: any) {
    const itens = (contagem.contagens_estoque_itens ?? []).map((it: any) => ({
      produto: it.produto_id,
      produto_nome: it.produto_nome,
      unid_med: it.unid_med,
      estoque: Number(it.qtd_sistema),
      custo_medio: Number(it.custo_medio),
      valor_total: Number(it.qtd_sistema) * Number(it.custo_medio),
      qtd_contada: it.qtd_contada != null ? String(it.qtd_contada) : '',
    }))
    printContagem(contagem.posto_nome, contagem.grupo_nome, contagem.data_contagem, itens)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-[13px]">Carregando histórico...</span>
    </div>
  )

  if (!contagens.length) return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
      <History className="w-8 h-8 opacity-30" />
      <p className="text-[13px]">Nenhuma contagem salva ainda</p>
    </div>
  )

  return (
    <div className="space-y-2">
      {contagens.map(c => {
        const dt = new Date(c.data_contagem + 'T12:00:00').toLocaleDateString('pt-BR')
        const criado = new Date(c.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        const isOpen = expanded === c.id
        const det = detalhe[c.id]

        return (
          <div key={c.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
                  <ClipboardCheck className="w-4 h-4 text-orange-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-gray-800 truncate">{c.posto_nome} · {c.grupo_nome}</p>
                  <p className="text-[11px] text-gray-400">Contagem: {dt} · Salvo: {criado}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => expandir(c.id)}
                  className="h-8 px-3 rounded-lg border border-gray-200 text-[12px] text-gray-600 hover:bg-gray-50 flex items-center gap-1.5 transition-colors"
                >
                  {loadingDetalhe === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                  Ver
                  {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
                {det && (
                  <button
                    onClick={() => imprimir(det)}
                    className="h-8 px-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[12px] font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Imprimir
                  </button>
                )}
              </div>
            </div>

            {isOpen && det && (
              <div className="border-t border-gray-100 overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Produto</th>
                      <th className="px-4 py-2 text-center font-medium text-gray-500 w-16">Unid</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-500 w-28">Qtd Sistema</th>
                      <th className="px-4 py-2 text-right font-medium text-orange-500 w-28">Qtd Contada</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-500 w-24">Diferença</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-400 w-24">Custo Unit.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(det.contagens_estoque_itens ?? []).map((it: any) => {
                      const sistema = Number(it.qtd_sistema)
                      const contada = it.qtd_contada != null ? Number(it.qtd_contada) : null
                      const diff = contada != null ? contada - sistema : null
                      return (
                        <tr key={it.id} className={cn('hover:bg-orange-50/10', diff != null && diff !== 0 && 'bg-red-50/20')}>
                          <td className="px-4 py-2 text-gray-800">
                            <div className="flex items-center gap-1.5">
                              {diff != null && diff !== 0 && <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0" />}
                              {it.produto_nome}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-center text-gray-500">{it.unid_med}</td>
                          <td className="px-4 py-2 text-right text-gray-700 tabular-nums">{sistema.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-semibold">
                            {contada != null ? (
                              <span className={diff !== 0 ? 'text-red-600' : 'text-green-600'}>
                                {contada.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                              </span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {diff != null ? (
                              <span className={cn('font-semibold', diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-400')}>
                                {diff >= 0 ? '+' : ''}{diff.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {it.unid_med}
                              </span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-2 text-right text-gray-400">{Number(it.custo_medio) > 0 ? formatCurrency(Number(it.custo_medio)) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function TabContagem() {
  const [postos,  setPostos]  = useState<PostoOpt[]>([])
  const [grupos,  setGrupos]  = useState<Grupo[]>([])
  const [view,    setView]    = useState<'nova' | 'historico'>('nova')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const sb = createClient()
    sb.from('postos').select('id, nome, codigo_empresa_externo, empresa_id')
      .not('codigo_empresa_externo', 'is', null).order('nome')
      .then(({ data }) => { if (data) setPostos(data as PostoOpt[]) })

    fetch('/api/autosystem/grupos-produto')
      .then(r => r.json())
      .then((list: Grupo[]) => setGrupos(Array.isArray(list) ? list : []))
      .catch(() => {})
  }, [])

  return (
    <div className="space-y-4">
      {/* Sub-navegação */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button onClick={() => setView('nova')}
          className={cn('flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all',
            view === 'nova'
              ? 'bg-white shadow-sm border border-orange-200 text-orange-600'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/60')}>
          <Plus className="w-3.5 h-3.5" />
          Nova Contagem
        </button>
        <button onClick={() => setView('historico')}
          className={cn('flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all',
            view === 'historico'
              ? 'bg-white shadow-sm border border-gray-200 text-gray-700'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/60')}>
          <History className="w-3.5 h-3.5" />
          Histórico
        </button>
      </div>

      {view === 'nova' && (
        <NovaContagem
          postos={postos}
          grupos={grupos}
          onSaved={() => setRefresh(r => r + 1)}
        />
      )}
      {view === 'historico' && (
        <Historico grupos={grupos} refresh={refresh} />
      )}
    </div>
  )
}
