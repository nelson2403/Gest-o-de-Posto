'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils/cn'
import { formatCurrency } from '@/lib/utils/formatters'
import {
  ClipboardCheck, Search, Save, Printer, ChevronDown, ChevronRight,
  Loader2, Package, AlertTriangle, History, Plus, Eye, RefreshCw, Barcode, Camera,
} from 'lucide-react'

const BarcodeScannerCamera = dynamic(() => import('@/components/BarcodeScannerCamera'), { ssr: false })

// ── Types ──────────────────────────────────────────────────────────────────────

interface PostoOpt { id: string; nome: string; codigo_empresa_externo: string | null; empresa_id: string }
interface Grupo    { id: string; codigo: number; nome: string }

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

function fmtDiff(contada: number, sistema: number, unid: string) {
  const diff = contada - sistema
  if (diff === 0) return <span className="text-gray-400 text-[11px]">0 {unid}</span>
  return (
    <span className={cn('text-[11px] font-semibold', diff > 0 ? 'text-green-600' : 'text-red-600')}>
      {diff > 0 ? '+' : ''}{diff.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {unid}
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
  const totalValor   = produtos.reduce((s, p) => s + p.valor_total, 0)

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Contagem de Estoque — ${postoNome}</title>
    <style>
      body{font-family:Arial,sans-serif;margin:20px;color:#111}
      h1{font-size:18px;margin:0 0 4px}h2{font-size:13px;color:#6b7280;font-weight:normal;margin:0 0 16px}
      table{width:100%;border-collapse:collapse}
      th{background:#f3f4f6;padding:7px 8px;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb}
      .footer{margin-top:24px;display:flex;gap:40px}
      .assinatura{border-top:1px solid #374151;padding-top:4px;font-size:11px;color:#6b7280;min-width:180px}
      @media print{button{display:none}}
    </style></head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
      <div><h1>Contagem de Estoque</h1><h2>${postoNome} · ${grupoNome} · ${dataFmt}</h2></div>
      <div style="text-align:right;font-size:11px;color:#6b7280">
        <div>${produtos.length} produto(s)</div>
        <div>Valor sistema: ${formatCurrency(totalValor)}</div>
      </div>
    </div>
    <table>
      <thead><tr>
        <th style="width:32px">#</th><th style="text-align:left">Produto</th><th>Unid</th>
        <th style="text-align:right">Qtd Sistema</th><th style="text-align:right">Qtd Contada</th>
        <th style="text-align:right">Diferença</th><th style="text-align:right">Custo Unit.</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:12px;padding:8px;background:#f9fafb;border-radius:6px;font-size:12px;display:flex;gap:24px">
      <span>Total produtos: <strong>${produtos.length}</strong></span>
      <span>Total sistema: <strong>${totalSistema.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</strong></span>
      <span>Valor total: <strong>${formatCurrency(totalValor)}</strong></span>
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

// ── Tabela de produtos ────────────────────────────────────────────────────────

function TabelaProdutos({
  produtos, busca, setBusca,
  filtroEstoque, setFiltroEstoque,
  postoNome, grupoNome, setQtd,
  empresaId, onScanFound,
}: {
  produtos: ProdutoContagem[]
  busca: string
  setBusca: (v: string) => void
  filtroEstoque: 'todos' | 'zerados' | 'com_estoque'
  setFiltroEstoque: (v: 'todos' | 'zerados' | 'com_estoque') => void
  postoNome: string
  grupoNome: string
  setQtd: (id: number, val: string) => void
  empresaId: string
  onScanFound: (produtoId: number) => void
}) {
  const filtrados = produtos
    .filter(p =>
      filtroEstoque === 'zerados'     ? p.estoque === 0 :
      filtroEstoque === 'com_estoque' ? p.estoque > 0   : true
    )
    .filter(p => busca.trim() ? p.produto_nome.toLowerCase().includes(busca.toLowerCase()) : true)

  const totalContados = produtos.filter(p => p.qtd_contada !== '').length
  const totalDiverg   = produtos.filter(p => {
    if (p.qtd_contada === '') return false
    return Math.abs(parseFloat(p.qtd_contada) - p.estoque) > 0.001
  }).length

  const [scanInput,        setScanInput]        = useState('')
  const [scanLoading,      setScanLoading]      = useState(false)
  const [scanErro,         setScanErro]         = useState('')
  const [scanCamera,       setScanCamera]       = useState(false)
  const [produtoDestacado, setProdutoDestacado] = useState<number | null>(null)
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({})
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function buscarPorBarras(codigo: string) {
    if (!codigo.trim() || !empresaId) return
    setScanLoading(true)
    setScanErro('')
    try {
      const res  = await fetch(`/api/estoque/produto-por-barras?codigo=${encodeURIComponent(codigo)}&empresaId=${empresaId}`)
      const json = await res.json()
      if (json.produto_id) {
        const id = Number(json.produto_id)
        setProdutoDestacado(id)
        setBusca('')
        setFiltroEstoque('todos')
        setTimeout(() => {
          const row = rowRefs.current[id]
          if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' })
            const input = row.querySelector('input[type="number"]') as HTMLInputElement | null
            input?.focus()
          }
          // Remove destaque após 3s
          setTimeout(() => setProdutoDestacado(null), 3000)
        }, 100)
        onScanFound(id)
        setScanErro('')
      } else {
        setScanErro(`Produto não encontrado: ${codigo}`)
      }
    } catch {
      setScanErro('Erro ao buscar produto')
    } finally {
      setScanLoading(false)
      setScanInput('')
    }
  }

  function onScanChange(val: string) {
    setScanInput(val)
    setScanErro('')
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current)
    // Leitores de código de barras emitem todos os dígitos rapidamente + Enter
    // Este timer dispara se o usuário parar de digitar por 300ms (digitação manual lenta)
    scanTimerRef.current = setTimeout(() => {
      if (val.trim().length >= 4) buscarPorBarras(val.trim())
    }, 300)
  }

  function onScanKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current)
      buscarPorBarras(scanInput.trim())
    }
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header da tabela */}
      <div className="flex-shrink-0 px-3 md:px-4 py-2.5 border-b border-gray-100 bg-gray-50/60 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardCheck className="w-4 h-4 text-orange-500 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[12px] md:text-[13px] font-semibold text-gray-700 truncate">
              {postoNome} · {grupoNome}
            </p>
            <p className="text-[10px] md:text-[11px] text-gray-400">
              {produtos.length} produto{produtos.length !== 1 ? 's' : ''} — {totalContados} preenchido{totalContados !== 1 ? 's' : ''}
              {totalDiverg > 0 && (
                <span className="ml-1.5 text-red-500 font-medium">· {totalDiverg} divergência{totalDiverg !== 1 ? 's' : ''}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Scanner de código de barras */}
          <div className="relative flex items-center gap-1">
            <div className="relative">
              <Barcode className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-indigo-400 pointer-events-none" />
              {scanLoading && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-indigo-400 animate-spin" />}
              <input
                type="text"
                placeholder="Ler código de barras..."
                value={scanInput}
                onChange={e => onScanChange(e.target.value)}
                onKeyDown={onScanKeyDown}
                className={cn(
                  'h-7 pl-6 pr-6 w-[155px] rounded-lg border text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400/30',
                  scanErro ? 'border-red-300 bg-red-50' : 'border-indigo-200',
                )}
              />
              {scanErro && (
                <div className="absolute top-full left-0 mt-1 text-[10px] text-red-600 bg-white border border-red-200 rounded-lg px-2 py-1 whitespace-nowrap z-20 shadow-sm">
                  {scanErro}
                </div>
              )}
            </div>
            <button
              onClick={() => setScanCamera(true)}
              title="Usar câmera"
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-500 transition-colors flex-shrink-0"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>
          {/* Modal câmera */}
          {scanCamera && (
            <BarcodeScannerCamera
              onScanned={codigo => { buscarPorBarras(codigo); setScanCamera(false) }}
              onClose={() => setScanCamera(false)}
            />
          )}
          {/* Filtro estoque */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[10px] font-medium">
            {([
              { key: 'todos',       label: 'Todos' },
              { key: 'com_estoque', label: 'C/ estoque' },
              { key: 'zerados',     label: 'Zerados' },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFiltroEstoque(key)}
                className={cn(
                  'px-2 py-1.5 transition-colors whitespace-nowrap',
                  filtroEstoque === key
                    ? key === 'zerados'     ? 'bg-red-500 text-white'
                    : key === 'com_estoque' ? 'bg-green-500 text-white'
                    :                        'bg-gray-600 text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-50',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Filtrar..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="h-7 pl-7 pr-2.5 w-[120px] md:w-[150px] rounded-lg border border-gray-200 text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-orange-400/30"
            />
          </div>
        </div>
      </div>

      {/* Tabela scrollável */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-[12px] md:text-[13px]">
          <thead className="sticky top-0 z-10 bg-white border-b border-gray-100">
            <tr>
              <th className="px-3 md:px-4 py-2 text-left font-medium text-gray-500 text-[10px] uppercase tracking-wide">Produto</th>
              <th className="px-2 py-2 text-center font-medium text-gray-500 text-[10px] uppercase tracking-wide w-12">Un</th>
              <th className="px-2 md:px-4 py-2 text-right font-medium text-gray-500 text-[10px] uppercase tracking-wide w-24 md:w-28">Sistema</th>
              <th className="px-2 md:px-4 py-2 text-right font-medium text-gray-500 text-[10px] uppercase tracking-wide w-24 md:w-28 hidden sm:table-cell">Valor</th>
              <th className="px-2 md:px-4 py-2 text-center font-medium text-orange-500 text-[10px] uppercase tracking-wide w-28 md:w-32">Contada</th>
              <th className="px-2 md:px-4 py-2 text-right font-medium text-gray-500 text-[10px] uppercase tracking-wide w-24 hidden md:table-cell">Diferença</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtrados.map(p => {
              const contada    = p.qtd_contada !== '' ? parseFloat(p.qtd_contada) : null
              const temDiverg  = contada != null && Math.abs(contada - p.estoque) > 0.001
              const destacado  = produtoDestacado === p.produto
              return (
                <tr
                  key={p.produto}
                  ref={el => { rowRefs.current[p.produto] = el }}
                  className={cn(
                    'transition-colors',
                    destacado    ? 'bg-indigo-100 ring-2 ring-inset ring-indigo-400' :
                    temDiverg    ? 'bg-red-50/30 hover:bg-red-50/50' :
                    'hover:bg-orange-50/20',
                  )}
                >
                  <td className="px-3 md:px-4 py-1.5 text-gray-800">
                    <div className="flex items-center gap-1.5">
                      {temDiverg && <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0" />}
                      <span className="text-[11px] md:text-[12px] leading-snug">{p.produto_nome}</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-center text-gray-500 text-[11px]">{p.unid_med}</td>
                  <td className="px-2 md:px-4 py-1.5 text-right text-gray-700 tabular-nums text-[11px] md:text-[12px]">
                    {p.estoque.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                  </td>
                  <td className="px-2 md:px-4 py-1.5 text-right text-gray-400 tabular-nums text-[10px] md:text-[11px] hidden sm:table-cell">
                    {p.custo_medio > 0 ? formatCurrency(p.valor_total) : '—'}
                  </td>
                  <td className="px-2 md:px-4 py-1.5">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.001"
                      min="0"
                      value={p.qtd_contada}
                      onChange={e => setQtd(p.produto, e.target.value)}
                      placeholder="—"
                      className={cn(
                        'w-full h-7 px-2 text-right rounded-lg border text-[12px] font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-400/40 transition-colors',
                        contada == null  ? 'border-gray-200 bg-white text-gray-600'
                          : temDiverg   ? 'border-red-300 bg-red-50 text-red-700'
                          : 'border-green-300 bg-green-50 text-green-700',
                      )}
                    />
                  </td>
                  <td className="px-2 md:px-4 py-1.5 text-right tabular-nums hidden md:table-cell">
                    {contada != null
                      ? fmtDiff(contada, p.estoque, p.unid_med)
                      : <span className="text-gray-300 text-[11px]">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="sticky bottom-0 border-t-2 border-gray-200 bg-gray-50">
              <td className="px-3 md:px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wide" colSpan={2}>
                {filtrados.length} itens
              </td>
              <td className="px-2 md:px-4 py-2 text-right text-[11px] font-bold text-gray-700 tabular-nums">
                {filtrados.reduce((s, p) => s + p.estoque, 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
              </td>
              <td className="px-2 md:px-4 py-2 text-right text-[10px] font-semibold text-gray-500 tabular-nums hidden sm:table-cell">
                {formatCurrency(filtrados.reduce((s, p) => s + p.valor_total, 0))}
              </td>
              <td className="px-2 md:px-4 py-2 text-right text-[11px] font-bold text-orange-600 tabular-nums">
                {(() => {
                  const tot = filtrados.reduce((s, p) => p.qtd_contada !== '' ? s + parseFloat(p.qtd_contada) : s, 0)
                  return tot > 0 ? tot.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '—'
                })()}
              </td>
              <td className="hidden md:table-cell" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ── Histórico ─────────────────────────────────────────────────────────────────

function Historico({ refresh }: { refresh: number }) {
  const [contagens,       setContagens]       = useState<ContagemSalva[]>([])
  const [loading,         setLoading]         = useState(false)
  const [expanded,        setExpanded]        = useState<string | null>(null)
  const [detalhe,         setDetalhe]         = useState<Record<string, any>>({})
  const [loadingDetalhe,  setLoadingDetalhe]  = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/estoque/contagens?limit=50')
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
      const res  = await fetch(`/api/estoque/contagens/${id}`)
      const json = await res.json()
      setDetalhe(prev => ({ ...prev, [id]: json.contagem }))
    } finally { setLoadingDetalhe(null) }
  }

  function imprimir(contagem: any) {
    const itens = (contagem.contagens_estoque_itens ?? []).map((it: any) => ({
      produto: it.produto_id, produto_nome: it.produto_nome, unid_med: it.unid_med,
      estoque: Number(it.qtd_sistema), custo_medio: Number(it.custo_medio),
      valor_total: Number(it.qtd_sistema) * Number(it.custo_medio),
      qtd_contada: it.qtd_contada != null ? String(it.qtd_contada) : '',
    }))
    printContagem(contagem.posto_nome, contagem.grupo_nome, contagem.data_contagem, itens)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full text-gray-400 gap-2">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-[13px]">Carregando histórico...</span>
    </div>
  )

  if (!contagens.length) return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
      <History className="w-8 h-8 opacity-30" />
      <p className="text-[13px]">Nenhuma contagem salva ainda</p>
    </div>
  )

  return (
    <div className="h-full overflow-auto space-y-2 pr-1">
      {contagens.map(c => {
        const dt     = new Date(c.data_contagem + 'T12:00:00').toLocaleDateString('pt-BR')
        const criado = new Date(c.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        const isOpen = expanded === c.id
        const det    = detalhe[c.id]

        return (
          <div key={c.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-3 md:px-4 py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
                  <ClipboardCheck className="w-3.5 h-3.5 text-orange-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] md:text-[13px] font-semibold text-gray-800 truncate">{c.posto_nome} · {c.grupo_nome}</p>
                  <p className="text-[10px] md:text-[11px] text-gray-400">Contagem: {dt} · Salvo: {criado}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => expandir(c.id)}
                  className="h-7 px-2.5 rounded-lg border border-gray-200 text-[11px] text-gray-600 hover:bg-gray-50 flex items-center gap-1 transition-colors"
                >
                  {loadingDetalhe === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                  <span className="hidden sm:inline">Ver</span>
                  {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
                {det && (
                  <button
                    onClick={() => imprimir(det)}
                    className="h-7 px-2.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-medium flex items-center gap-1 transition-colors"
                  >
                    <Printer className="w-3 h-3" />
                    <span className="hidden sm:inline">Imprimir</span>
                  </button>
                )}
              </div>
            </div>

            {isOpen && det && (
              <div className="border-t border-gray-100 overflow-x-auto">
                <table className="w-full text-[11px] md:text-[12px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-3 md:px-4 py-2 text-left font-medium text-gray-500">Produto</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-500 w-12">Un</th>
                      <th className="px-2 md:px-4 py-2 text-right font-medium text-gray-500 w-24">Sistema</th>
                      <th className="px-2 md:px-4 py-2 text-right font-medium text-orange-500 w-24">Contada</th>
                      <th className="px-2 md:px-4 py-2 text-right font-medium text-gray-500 w-24 hidden md:table-cell">Diferença</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(det.contagens_estoque_itens ?? []).map((it: any) => {
                      const sistema = Number(it.qtd_sistema)
                      const contada = it.qtd_contada != null ? Number(it.qtd_contada) : null
                      const diff    = contada != null ? contada - sistema : null
                      return (
                        <tr key={it.id} className={cn('hover:bg-orange-50/10', diff != null && diff !== 0 && 'bg-red-50/20')}>
                          <td className="px-3 md:px-4 py-1.5 text-gray-800">
                            <div className="flex items-center gap-1.5">
                              {diff != null && diff !== 0 && <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0" />}
                              {it.produto_nome}
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-center text-gray-500">{it.unid_med}</td>
                          <td className="px-2 md:px-4 py-1.5 text-right text-gray-700 tabular-nums">{sistema.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</td>
                          <td className="px-2 md:px-4 py-1.5 text-right tabular-nums font-semibold">
                            {contada != null
                              ? <span className={diff !== 0 ? 'text-red-600' : 'text-green-600'}>{contada.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-2 md:px-4 py-1.5 text-right tabular-nums hidden md:table-cell">
                            {diff != null
                              ? <span className={cn('font-semibold', diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-400')}>
                                  {diff >= 0 ? '+' : ''}{diff.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {it.unid_med}
                                </span>
                              : <span className="text-gray-300">—</span>}
                          </td>
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

// ── Página principal ───────────────────────────────────────────────────────────

export default function ContagemEstoquePage() {
  const supabase = createClient()

  const [postos,       setPostos]       = useState<PostoOpt[]>([])
  const [grupos,       setGrupos]       = useState<Grupo[]>([])
  const [view,         setView]         = useState<'nova' | 'historico'>('nova')
  const [refresh,      setRefresh]      = useState(0)

  // Nova contagem state
  const [postoId,      setPostoId]      = useState('')
  const [grupoId,      setGrupoId]      = useState('')
  const [dataContagem, setDataContagem] = useState(new Date().toISOString().slice(0, 10))
  const [produtos,     setProdutos]     = useState<ProdutoContagem[]>([])
  const [loading,        setLoading]        = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [busca,          setBusca]          = useState('')
  const [filtroEstoque,  setFiltroEstoque]  = useState<'todos' | 'zerados' | 'com_estoque'>('todos')
  const [saved,          setSaved]          = useState<{ id: string } | null>(null)

  const posto = postos.find(p => p.id === postoId)
  const grupo = grupos.find(g => g.id === grupoId)

  useEffect(() => {
    supabase.from('postos').select('id, nome, codigo_empresa_externo, empresa_id')
      .not('codigo_empresa_externo', 'is', null).order('nome')
      .then(({ data }) => { if (data) setPostos(data as PostoOpt[]) })

    fetch('/api/autosystem/grupos-produto')
      .then(r => r.json())
      .then((list: Grupo[]) => setGrupos(Array.isArray(list) ? list : []))
      .catch(() => {})
  }, [])

  async function carregar() {
    if (!posto?.codigo_empresa_externo || !grupoId) return
    setLoading(true)
    setSaved(null)
    setProdutos([])
    setBusca('')
    try {
      const res  = await fetch(`/api/estoque/contagem-produtos?empresaId=${posto.codigo_empresa_externo}&grupoId=${grupoId}`)
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
      const { data: usuario }  = await supabase.from('usuarios').select('empresa_id').eq('id', user!.id).single()

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
            produto_id:   p.produto,
            produto_nome: p.produto_nome,
            unid_med:     p.unid_med,
            qtd_sistema:  p.estoque,
            custo_medio:  p.custo_medio,
            qtd_contada:  p.qtd_contada !== '' ? parseFloat(p.qtd_contada) : null,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast({ variant: 'destructive', title: 'Erro', description: json.error }); return }
      setSaved({ id: json.id })
      setRefresh(r => r + 1)
      toast({ title: 'Contagem salva com sucesso!' })
    } finally { setSaving(false) }
  }

  const totalContados = produtos.filter(p => p.qtd_contada !== '').length

  return (
    // h-full fills the <main> which is flex-1 in the layout — no outer scroll
    <div className="h-full flex flex-col overflow-hidden bg-gray-50">

      {/* ── Barra de topo ── */}
      <div className="flex-shrink-0 px-3 md:px-6 py-2.5 bg-white border-b border-gray-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
            <ClipboardCheck className="w-4 h-4 text-orange-600" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[14px] md:text-[16px] font-bold text-gray-900 leading-tight">Contagem de Estoque</h1>
            <p className="text-[10px] md:text-[11px] text-gray-400 hidden sm:block">Contagem física vs. sistema AUTOSYSTEM</p>
          </div>
        </div>
        {/* Sub-nav */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl flex-shrink-0">
          <button
            onClick={() => setView('nova')}
            className={cn(
              'flex items-center gap-1 md:gap-1.5 px-2.5 md:px-4 py-1.5 rounded-lg text-[11px] md:text-[13px] font-semibold transition-all',
              view === 'nova'
                ? 'bg-white shadow-sm border border-orange-200 text-orange-600'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/60',
            )}
          >
            <Plus className="w-3 h-3 md:w-3.5 md:h-3.5" />
            <span className="hidden sm:inline">Nova Contagem</span>
            <span className="sm:hidden">Nova</span>
          </button>
          <button
            onClick={() => setView('historico')}
            className={cn(
              'flex items-center gap-1 md:gap-1.5 px-2.5 md:px-4 py-1.5 rounded-lg text-[11px] md:text-[13px] font-semibold transition-all',
              view === 'historico'
                ? 'bg-white shadow-sm border border-gray-200 text-gray-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/60',
            )}
          >
            <History className="w-3 h-3 md:w-3.5 md:h-3.5" />
            <span>Histórico</span>
          </button>
        </div>
      </div>

      {/* ── Filtros (só Nova Contagem) ── */}
      {view === 'nova' && (
        <div className="flex-shrink-0 px-3 md:px-6 py-2 bg-white border-b border-gray-100">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Posto</label>
              <select
                value={postoId}
                onChange={e => { setPostoId(e.target.value); setProdutos([]); setSaved(null) }}
                className="h-8 px-2.5 rounded-lg border border-gray-200 text-[12px] bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30"
              >
                <option value="">Selecione o posto...</option>
                {postos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Grupo</label>
              <select
                value={grupoId}
                onChange={e => { setGrupoId(e.target.value); setProdutos([]); setSaved(null) }}
                className="h-8 px-2.5 rounded-lg border border-gray-200 text-[12px] bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30"
              >
                <option value="">Selecione o grupo...</option>
                {grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Data</label>
              <input
                type="date"
                value={dataContagem}
                onChange={e => setDataContagem(e.target.value)}
                className="h-8 px-2.5 rounded-lg border border-gray-200 text-[12px] bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30"
              />
            </div>
            <button
              onClick={carregar}
              disabled={!postoId || !grupoId || loading}
              className="h-8 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[12px] font-semibold transition-colors flex items-center gap-1.5 shadow-sm flex-shrink-0"
            >
              {loading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <RefreshCw className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Carregar</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Área de conteúdo principal ── */}
      <div className="flex-1 min-h-0 overflow-hidden px-3 md:px-6 py-3">
        {/* ── Nova contagem ── */}
        {view === 'nova' && (
          <>
            {loading && (
              <div className="flex items-center justify-center h-full text-gray-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-[13px]">Carregando produtos do AUTOSYSTEM...</span>
              </div>
            )}
            {!loading && produtos.length > 0 && (
              <TabelaProdutos
                produtos={produtos}
                busca={busca}
                setBusca={setBusca}
                filtroEstoque={filtroEstoque}
                setFiltroEstoque={setFiltroEstoque}
                postoNome={posto?.nome ?? ''}
                grupoNome={grupo?.nome ?? ''}
                setQtd={setQtd}
                empresaId={posto?.codigo_empresa_externo ?? ''}
                onScanFound={() => {}}
              />
            )}
            {!loading && !produtos.length && postoId && grupoId && (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                <Package className="w-8 h-8 opacity-30" />
                <p className="text-[13px]">Clique em <strong>Carregar</strong> para iniciar a contagem</p>
              </div>
            )}
            {!loading && !postoId && (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                <ClipboardCheck className="w-10 h-10 opacity-20" />
                <p className="text-[13px]">Selecione o posto e o grupo para iniciar</p>
              </div>
            )}
          </>
        )}

        {/* ── Histórico ── */}
        {view === 'historico' && <Historico refresh={refresh} />}
      </div>

      {/* ── Rodapé de ações (só quando tem produtos carregados) ── */}
      {view === 'nova' && produtos.length > 0 && !loading && (
        <div className="flex-shrink-0 px-3 md:px-6 py-2.5 bg-white border-t border-gray-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <p className="text-[11px] text-gray-400">
              {totalContados > 0
                ? `${totalContados} de ${produtos.length} preenchidos`
                : 'Preencha as quantidades para salvar'}
            </p>
            {saved && (
              <span className="text-[11px] text-green-600 font-medium flex items-center gap-1">
                <ClipboardCheck className="w-3 h-3" /> Salvo
              </span>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {saved && (
              <button
                onClick={() => printContagem(posto!.nome, grupo!.nome, dataContagem, produtos)}
                className="h-8 px-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-[12px] font-medium flex items-center gap-1.5 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir
              </button>
            )}
            <button
              onClick={salvar}
              disabled={saving || totalContados === 0}
              className="h-8 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[12px] font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Salvar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
