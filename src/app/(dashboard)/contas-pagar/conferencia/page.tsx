'use client'

import { useEffect, useMemo, useRef, useState, useCallback, Fragment } from 'react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils/cn'
import {
  Loader2, RefreshCw, AlertTriangle, Database, ChevronRight, ChevronDown,
  Building2, CheckCircle2, Search, Printer,
} from 'lucide-react'
import type { TituloASEmpresa } from '@/app/api/contas-pagar/titulos-as-empresas/route'

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(s: string | null | undefined) {
  if (!s) return '—'
  return new Date(s + 'T12:00:00').toLocaleDateString('pt-BR')
}

const SITUACAO_CFG: Record<string, { label: string; cls: string }> = {
  a_vencer:  { label: 'A Vencer',  cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  em_atraso: { label: 'Em Atraso', cls: 'bg-red-100 text-red-700 border-red-200' },
  pago:      { label: 'Pago',      cls: 'bg-green-100 text-green-700 border-green-200' },
}

export default function ConferenciaPage() {
  const [selectedData, setSelectedData] = useState(new Date().toISOString().slice(0, 10))

  const [empresas, setEmpresas] = useState<TituloASEmpresa[]>([])
  const [loading,  setLoading]  = useState(false)
  const [erro,     setErro]     = useState('')
  const [busca,    setBusca]    = useState('')

  const [aberto, setAberto] = useState<Set<string>>(new Set())

  // ── Impressão ─────────────────────────────────────────────────────────
  // Quando o usuário pede um modo, expandimos/recolhemos a árvore conforme
  // escolhido, esperamos o React pintar e disparamos window.print(). Após o
  // diálogo fechar (afterprint), restauramos o estado anterior.
  const [printMode, setPrintMode] = useState<'recolhido' | 'expandido' | null>(null)
  const [showPrintMenu, setShowPrintMenu] = useState(false)
  const printMenuRef = useRef<HTMLDivElement | null>(null)
  const abertoBackupRef = useRef<Set<string> | null>(null)

  // Empresas em ordem crescente por nome, com filtro de busca aplicado.
  const empresasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const sorted = [...empresas].sort((a, b) =>
      a.posto_nome.localeCompare(b.posto_nome, 'pt-BR'),
    )
    if (!termo) return sorted
    return sorted.filter(e => e.posto_nome.toLowerCase().includes(termo))
  }, [empresas, busca])

  const load = useCallback(async () => {
    if (!selectedData) return
    setLoading(true)
    setErro('')
    setEmpresas([])

    // Lookback 1 ano — vencidos até a data + o que vence nessa data
    const d = new Date(selectedData)
    d.setFullYear(d.getFullYear() - 1)
    const venctoIni = d.toISOString().slice(0, 10)

    const params = new URLSearchParams({
      vencto_ini: venctoIni,
      vencto_fim: selectedData,
      situacao:   'aberto',
    })

    try {
      const res  = await fetch(`/api/contas-pagar/titulos-as-empresas?${params}`)
      const json = await res.json()
      if (!res.ok) {
        setErro(json.error ?? 'Erro ao buscar AutoSystem')
        return
      }
      setEmpresas(json.empresas ?? [])
    } catch (e: any) {
      setErro(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }, [selectedData])

  useEffect(() => { load() }, [load])

  function toggle(postoId: string) {
    setAberto(prev => {
      const next = new Set(prev)
      next.has(postoId) ? next.delete(postoId) : next.add(postoId)
      return next
    })
  }

  function expandirTodas() { setAberto(new Set(empresasFiltradas.map(e => e.posto_id))) }
  function recolherTodas() { setAberto(new Set()) }

  function imprimir(modo: 'recolhido' | 'expandido') {
    setShowPrintMenu(false)
    abertoBackupRef.current = new Set(aberto)
    if (modo === 'recolhido') setAberto(new Set())
    else                      setAberto(new Set(empresasFiltradas.map(e => e.posto_id)))
    setPrintMode(modo)
  }

  // Aciona window.print() depois que o React pinta o estado escolhido.
  useEffect(() => {
    if (!printMode) return
    const restore = () => {
      if (abertoBackupRef.current) setAberto(abertoBackupRef.current)
      abertoBackupRef.current = null
      setPrintMode(null)
    }
    window.addEventListener('afterprint', restore, { once: true })
    const id = window.requestAnimationFrame(() => window.print())
    return () => {
      window.cancelAnimationFrame(id)
      window.removeEventListener('afterprint', restore)
    }
  }, [printMode])

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    if (!showPrintMenu) return
    const fn = (e: MouseEvent) => {
      if (printMenuRef.current && !printMenuRef.current.contains(e.target as Node)) {
        setShowPrintMenu(false)
      }
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [showPrintMenu])

  // KPIs e total geral consideram a lista filtrada (assim os números seguem o que o usuário está vendo)
  const totalGeral     = empresasFiltradas.reduce((s, e) => s + e.total, 0)
  const totalAVencer   = empresasFiltradas.reduce((s, e) => s + e.a_vencer, 0)
  const totalEmAtraso  = empresasFiltradas.reduce((s, e) => s + e.em_atraso, 0)
  const qtTotal        = empresasFiltradas.reduce((s, e) => s + e.qt_total, 0)
  const qtEmAtraso     = empresasFiltradas.reduce((s, e) => s + e.qt_em_atraso, 0)
  const qtAVencer      = empresasFiltradas.reduce((s, e) => s + e.qt_a_vencer, 0)

  return (
    <div className="flex flex-col min-h-full">
      <div className="print:hidden">
        <Header title="Conferência Diária" description="Títulos a pagar por empresa — AutoSystem" />
      </div>

      {/* Cabeçalho exclusivo da impressão */}
      <div className="hidden print:block px-2 pt-1 pb-3 border-b border-gray-300 mb-3">
        <p className="text-[10pt] font-bold text-gray-900">Conferência Diária — Títulos a Pagar</p>
        <p className="text-[8.5pt] text-gray-700">
          Posição em {fmtDate(selectedData)}
          {' · '}{empresasFiltradas.length} empresa{empresasFiltradas.length !== 1 ? 's' : ''}
          {' · '}{qtTotal} título{qtTotal !== 1 ? 's' : ''}
          {' · '}Total {fmtBRL(totalGeral)}
          {qtEmAtraso > 0 && <> {' · '}<span className="text-red-700">Em atraso: {qtEmAtraso} ({fmtBRL(totalEmAtraso)})</span></>}
          {printMode && <> {' · '}<span className="text-gray-500">{printMode === 'recolhido' ? 'Visão recolhida' : 'Visão detalhada'}</span></>}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-5 print:p-0 print:overflow-visible print:space-y-3">

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 print:hidden">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-[12px] text-gray-500 mb-1 block">Data</Label>
              <Input
                type="date"
                value={selectedData}
                onChange={e => setSelectedData(e.target.value)}
                className="h-9 text-[13px] w-44"
              />
            </div>
            <Button size="sm" variant="outline" onClick={load}
              disabled={loading} className="h-9 gap-1.5 text-[12px]">
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
              Atualizar
            </Button>
            <div className="flex-1 min-w-[200px] relative">
              <Label className="text-[12px] text-gray-500 mb-1 block">Buscar empresa</Label>
              <Search className="absolute left-2.5 top-[31px] w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <Input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Nome do posto ou empresa..."
                className="h-9 text-[13px] pl-8"
              />
            </div>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="ghost" onClick={expandirTodas}
                disabled={!empresasFiltradas.length} className="h-9 text-[12px]">
                Expandir todas
              </Button>
              <Button size="sm" variant="ghost" onClick={recolherTodas}
                disabled={!empresasFiltradas.length} className="h-9 text-[12px]">
                Recolher todas
              </Button>
              <div ref={printMenuRef} className="relative">
                <Button size="sm" variant="outline"
                  onClick={() => setShowPrintMenu(v => !v)}
                  disabled={!empresasFiltradas.length}
                  className="h-9 gap-1.5 text-[12px]">
                  <Printer className="w-3.5 h-3.5" />
                  Imprimir
                  <ChevronDown className={cn('w-3 h-3 opacity-60 transition-transform', showPrintMenu && 'rotate-180')} />
                </Button>
                {showPrintMenu && (
                  <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-xl z-30 overflow-hidden">
                    <button
                      onClick={() => imprimir('recolhido')}
                      className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 border-b border-gray-100 transition-colors"
                    >
                      <Building2 className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-[12.5px] font-semibold text-gray-800">Recolhido</p>
                        <p className="text-[11px] text-gray-500">Apenas empresas + total</p>
                      </div>
                    </button>
                    <button
                      onClick={() => imprimir('expandido')}
                      className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                    >
                      <Database className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-[12.5px] font-semibold text-gray-800">Expandido</p>
                        <p className="text-[11px] text-gray-500">Empresas + lista de títulos</p>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : erro ? (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-[13px] text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {erro}
          </div>
        ) : empresas.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p className="text-[13px]">Nenhum título em aberto até esta data</p>
          </div>
        ) : (
          <>
            {/* KPIs gerais */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 print:hidden">
              {[
                { label: 'Total geral',  value: fmtBRL(totalGeral),    sub: `${qtTotal} título(s) · ${empresas.length} empresa(s)`, color: 'bg-gray-500' },
                { label: 'A Vencer',     value: fmtBRL(totalAVencer),  sub: `${qtAVencer} título(s)`,                                color: 'bg-blue-500' },
                { label: 'Em Atraso',    value: fmtBRL(totalEmAtraso), sub: `${qtEmAtraso} título(s)`,                               color: qtEmAtraso > 0 ? 'bg-red-500' : 'bg-gray-400' },
                { label: 'Empresas',     value: String(empresas.length), sub: 'com títulos em aberto',                                color: 'bg-emerald-500' },
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

            {/* Treeview empresa → títulos (somente tela) */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden print:hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] print:text-[9pt] print:table-fixed">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide print:px-2 print:py-1">Empresa</th>
                      <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-44 print:w-[26%] print:px-2 print:py-1">Valor total</th>
                      <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-28 print:w-[12%] print:px-2 print:py-1">Títulos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empresasFiltradas.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-10 text-center text-[12.5px] text-gray-400 italic">
                          Nenhuma empresa corresponde ao filtro &ldquo;{busca}&rdquo;.
                        </td>
                      </tr>
                    ) : empresasFiltradas.map(e => {
                      const isOpen = aberto.has(e.posto_id)
                      return (
                        <Fragment key={e.posto_id}>
                          <tr
                            className={cn(
                              'border-b border-gray-100 cursor-pointer hover:bg-blue-50/40',
                              isOpen && 'bg-blue-50/30',
                            )}
                            onClick={() => toggle(e.posto_id)}
                          >
                            <td className="px-4 py-2.5 print:px-2 print:py-1">
                              <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-700 print:text-[9pt]">
                                <span className="w-3.5 h-3.5 flex items-center justify-center text-gray-400 print:hidden">
                                  {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                </span>
                                <Building2 className="w-3.5 h-3.5 text-gray-400 print:hidden" />
                                {/* Bullet exclusivo da impressão */}
                                <span className="hidden print:inline-block w-1.5 h-1.5 rounded-full bg-gray-700 flex-shrink-0" aria-hidden />
                                <span className="truncate">{e.posto_nome}</span>
                                {e.qt_em_atraso > 0 && (
                                  <Badge variant="outline" className="ml-2 text-[10px] bg-red-50 text-red-700 border-red-200 print:hidden">
                                    {e.qt_em_atraso} em atraso
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-bold text-gray-800 print:px-2 print:py-1">
                              {fmtBRL(e.total)}
                            </td>
                            <td className="px-4 py-2.5 text-right text-[12px] text-gray-500 tabular-nums print:px-2 print:py-1 print:text-[9pt]">
                              {e.qt_total}
                            </td>
                          </tr>

                          {isOpen && (
                            <tr>
                              <td colSpan={3} className="p-0 bg-gray-50/50 border-b border-gray-100 print:bg-transparent">
                                <div className="px-4 py-3 print:px-0 print:py-1">
                                  <table className="w-full text-[12.5px] print:text-[8pt] print:table-fixed">
                                    <thead>
                                      <tr className="border-b border-gray-200 text-[10.5px] text-gray-400 uppercase tracking-wide print:text-[7.5pt] print:text-gray-600">
                                        <th className="text-left px-2 py-1.5 font-semibold w-24 print:w-[10%] print:px-1 print:py-0.5">Data</th>
                                        <th className="text-left px-2 py-1.5 font-semibold w-28 print:w-[11%] print:px-1 print:py-0.5">Documento</th>
                                        <th className="text-left px-2 py-1.5 font-semibold print:w-[22%] print:px-1 print:py-0.5">Fornecedor</th>
                                        <th className="text-left px-2 py-1.5 font-semibold w-44 print:w-[16%] print:px-1 print:py-0.5">Motivo</th>
                                        <th className="text-left px-2 py-1.5 font-semibold print:w-[14%] print:px-1 print:py-0.5">Observação</th>
                                        <th className="text-right px-2 py-1.5 font-semibold w-32 print:w-[15%] print:px-1 print:py-0.5">Valor</th>
                                        <th className="text-center px-2 py-1.5 font-semibold w-28 print:w-[12%] print:px-1 print:py-0.5">Situação</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                      {e.titulos.map((t, i) => {
                                        const cfg = SITUACAO_CFG[t.situacao] ?? SITUACAO_CFG.a_vencer
                                        return (
                                          <tr key={t.mlid ?? i} className={cn('hover:bg-white', t.situacao === 'em_atraso' && 'bg-red-50/30')}>
                                            <td className={cn('px-2 py-1.5 whitespace-nowrap print:whitespace-normal print:px-1 print:py-0.5', t.situacao === 'em_atraso' ? 'text-red-600 font-medium' : 'text-gray-700')}>
                                              {fmtDate(t.data)}
                                            </td>
                                            <td className="px-2 py-1.5 font-mono text-[11.5px] text-gray-600 print:text-[7.5pt] print:px-1 print:py-0.5 print:break-all">{t.documento || '—'}</td>
                                            <td className="px-2 py-1.5 text-gray-700 max-w-[220px] print:max-w-none print:px-1 print:py-0.5">
                                              <span className="truncate block print:whitespace-normal print:truncate-none">{t.pessoa_nome || '—'}</span>
                                            </td>
                                            <td className="px-2 py-1.5 text-gray-600 max-w-[180px] print:max-w-none print:px-1 print:py-0.5">
                                              <span className="truncate block print:whitespace-normal print:truncate-none">{t.motivo_nome || '—'}</span>
                                            </td>
                                            <td className="px-2 py-1.5 text-gray-600 max-w-[260px] print:max-w-none print:px-1 print:py-0.5">
                                              <span className="truncate block print:whitespace-normal print:truncate-none">{t.obs || '—'}</span>
                                            </td>
                                            <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-gray-700 whitespace-nowrap print:whitespace-normal print:px-1 print:py-0.5">
                                              {fmtBRL(t.valor)}
                                            </td>
                                            <td className="px-2 py-1.5 text-center print:px-1 print:py-0.5">
                                              <span className="inline-block print:hidden">
                                                <Badge variant="outline" className={cn('text-[10.5px]', cfg.cls)}>
                                                  {cfg.label}
                                                </Badge>
                                              </span>
                                              <span className="hidden print:inline text-[7.5pt] font-medium">
                                                {cfg.label}
                                              </span>
                                            </td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t-2 border-gray-200">
                      <td className="px-4 py-2.5 text-[12px] font-semibold text-gray-600">
                        Total ({empresasFiltradas.length} empresa{empresasFiltradas.length !== 1 ? 's' : ''}
                        {busca && empresas.length !== empresasFiltradas.length && ` de ${empresas.length}`})
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-gray-800 tabular-nums">{fmtBRL(totalGeral)}</td>
                      <td className="px-4 py-2.5 text-right text-[12px] text-gray-500 tabular-nums">{qtTotal}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* ── View exclusiva de impressão ──────────────────────────── */}
            {/* Sem tabelas aninhadas: cada empresa vira um bloco com header     */}
            {/* compacto + (no modo expandido) tabela plana de títulos.         */}
            <div className="hidden print:block">
              {empresasFiltradas.map(e => (
                <div key={e.posto_id} className="mb-3 print-empresa-block">
                  <div className="flex items-baseline gap-2 border-b border-gray-400 pb-0.5 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-800 inline-block flex-shrink-0" aria-hidden />
                    <span className="text-[9.5pt] font-bold text-gray-900 flex-1">{e.posto_nome}</span>
                    <span className="text-[8.5pt] text-gray-700 tabular-nums">{e.qt_total} tít.</span>
                    <span className="text-[9.5pt] font-bold text-gray-900 tabular-nums">{fmtBRL(e.total)}</span>
                  </div>

                  {printMode === 'expandido' && e.titulos.length > 0 && (
                    <table className="w-full text-[8pt]">
                      <thead>
                        <tr className="border-b border-gray-300 text-[7pt] text-gray-600 uppercase tracking-wide">
                          <th className="text-left px-1 py-0.5 font-semibold w-[10%]">Data</th>
                          <th className="text-left px-1 py-0.5 font-semibold w-[11%]">Documento</th>
                          <th className="text-left px-1 py-0.5 font-semibold w-[24%]">Fornecedor</th>
                          <th className="text-left px-1 py-0.5 font-semibold w-[16%]">Motivo</th>
                          <th className="text-left px-1 py-0.5 font-semibold w-[14%]">Observação</th>
                          <th className="text-right px-1 py-0.5 font-semibold w-[14%]">Valor</th>
                          <th className="text-center px-1 py-0.5 font-semibold w-[11%]">Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {e.titulos.map((t, i) => (
                          <tr key={t.mlid ?? i} className="border-b border-gray-100">
                            <td className={cn('px-1 py-0.5 whitespace-nowrap', t.situacao === 'em_atraso' ? 'text-red-700 font-medium' : 'text-gray-800')}>
                              {fmtDate(t.data)}
                            </td>
                            <td className="px-1 py-0.5 font-mono text-[7pt] text-gray-700">{t.documento || '—'}</td>
                            <td className="px-1 py-0.5 text-gray-800">{t.pessoa_nome || '—'}</td>
                            <td className="px-1 py-0.5 text-gray-700">{t.motivo_nome || '—'}</td>
                            <td className="px-1 py-0.5 text-gray-700">{t.obs || '—'}</td>
                            <td className="px-1 py-0.5 text-right tabular-nums font-semibold text-gray-800 whitespace-nowrap">{fmtBRL(t.valor)}</td>
                            <td className="px-1 py-0.5 text-center text-[7pt] font-medium whitespace-nowrap">
                              {SITUACAO_CFG[t.situacao]?.label ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}

              {/* Rodapé de totais geral da impressão */}
              <div className="flex items-baseline gap-2 border-t-2 border-gray-700 pt-1 mt-3">
                <span className="text-[9pt] font-bold text-gray-900 flex-1">
                  Total ({empresasFiltradas.length} empresa{empresasFiltradas.length !== 1 ? 's' : ''})
                </span>
                <span className="text-[8.5pt] text-gray-700 tabular-nums">{qtTotal} tít.</span>
                <span className="text-[9.5pt] font-bold text-gray-900 tabular-nums">{fmtBRL(totalGeral)}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
