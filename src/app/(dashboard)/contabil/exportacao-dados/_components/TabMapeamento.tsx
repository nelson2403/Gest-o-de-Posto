'use client'

import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/hooks/use-toast'
import {
  Search, Loader2, ArrowRightLeft, Upload, Trash2, Link2, Link2Off,
  CheckCircle2, AlertCircle, RefreshCw, FileSpreadsheet,
  ChevronRight, ChevronDown, ChevronsDownUp, ChevronsUpDown,
} from 'lucide-react'
import type { ContabilPlanoConta } from '@/types/database.types'
import { ImportarPlanoModal } from './ImportarPlanoModal'
import {
  buildTreeFromCodigos, visiveisComAncestrais, flattenTree, todosOsCodigosNonLeaves,
} from './tree'

interface ContaAS {
  codigo:           string
  nome:             string
  natureza:         'Débito' | 'Crédito'
  mapeada:          boolean
  conta_contabil:   string | null
  mapeamento_id:    string | null
}

export function TabMapeamento() {
  const [contasAS,       setContasAS]       = useState<ContaAS[]>([])
  const [contasContabil, setContasContabil] = useState<ContabilPlanoConta[]>([])
  const [loadingAS,      setLoadingAS]      = useState(true)
  const [loadingCT,      setLoadingCT]      = useState(true)

  const [searchAS, setSearchAS] = useState('')
  const [searchCT, setSearchCT] = useState('')
  const [filtroAS, setFiltroAS] = useState<'todas' | 'naoMapeadas' | 'mapeadas'>('todas')

  const [expandedAS, setExpandedAS] = useState<Set<string>>(new Set())
  const [expandedCT, setExpandedCT] = useState<Set<string>>(new Set())

  const [selAS, setSelAS] = useState<string | null>(null)
  const [linking, setLinking] = useState(false)
  const [showImport, setShowImport] = useState(false)

  async function carregarAS() {
    setLoadingAS(true)
    try {
      const r = await fetch('/api/contabil/contas-autosystem')
      const json = await r.json()
      if (!r.ok) throw new Error(json.error ?? `Erro HTTP ${r.status}`)
      setContasAS(json.contas ?? [])
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao carregar plano AUTOSYSTEM', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setLoadingAS(false)
    }
  }

  async function carregarCT() {
    setLoadingCT(true)
    try {
      const r = await fetch('/api/contabil/plano-contas')
      const json = await r.json()
      if (!r.ok) throw new Error(json.error ?? `Erro HTTP ${r.status}`)
      setContasContabil(json.contas ?? [])
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao carregar plano contábil', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setLoadingCT(false)
    }
  }

  useEffect(() => { carregarAS(); carregarCT() }, [])

  const selASItem = useMemo(
    () => contasAS.find(c => c.codigo === selAS) ?? null,
    [contasAS, selAS],
  )

  const selCTVinculado = useMemo(() => {
    if (!selASItem?.conta_contabil) return null
    return contasContabil.find(c => c.codigo === selASItem.conta_contabil) ?? null
  }, [selASItem, contasContabil])

  // ── Árvore AUTOSYSTEM ────────────────────────────────────────────────────
  const treeAS = useMemo(() => buildTreeFromCodigos(contasAS.map(c => ({ ...c }))), [contasAS])

  const filtroAtivoAS = searchAS.trim() !== '' || filtroAS !== 'todas'
  const matchesAS = useMemo(() => {
    const s = searchAS.trim().toLowerCase()
    const result = new Set<string>()
    for (const c of contasAS) {
      if (filtroAS === 'mapeadas'    && !c.mapeada) continue
      if (filtroAS === 'naoMapeadas' &&  c.mapeada) continue
      if (s) {
        if (!c.codigo.toLowerCase().includes(s) && !c.nome.toLowerCase().includes(s)) continue
      }
      result.add(c.codigo)
    }
    return result
  }, [contasAS, searchAS, filtroAS])

  const visiveisAS = useMemo(
    () => filtroAtivoAS ? visiveisComAncestrais(treeAS, matchesAS) : null,
    [treeAS, matchesAS, filtroAtivoAS],
  )

  const expandedEfetivoAS = useMemo(() => {
    if (!filtroAtivoAS) return expandedAS
    const merged = new Set(expandedAS)
    if (visiveisAS) {
      // Durante o filtro, força expansão dos ancestrais para o caminho aparecer
      for (const c of visiveisAS) if (!matchesAS.has(c)) merged.add(c)
    }
    return merged
  }, [expandedAS, visiveisAS, matchesAS, filtroAtivoAS])

  const flatAS = useMemo(
    () => flattenTree(treeAS, expandedEfetivoAS, visiveisAS),
    [treeAS, expandedEfetivoAS, visiveisAS],
  )

  // ── Árvore Contábil ──────────────────────────────────────────────────────
  const treeCT = useMemo(() => buildTreeFromCodigos(contasContabil.map(c => ({ ...c }))), [contasContabil])

  const filtroAtivoCT = searchCT.trim() !== ''
  const matchesCT = useMemo(() => {
    const s = searchCT.trim().toLowerCase()
    const result = new Set<string>()
    for (const c of contasContabil) {
      if (s) {
        if (!c.codigo.toLowerCase().includes(s) && !c.descricao.toLowerCase().includes(s)) continue
      }
      result.add(c.codigo)
    }
    return result
  }, [contasContabil, searchCT])

  const visiveisCT = useMemo(
    () => filtroAtivoCT ? visiveisComAncestrais(treeCT, matchesCT) : null,
    [treeCT, matchesCT, filtroAtivoCT],
  )

  const expandedEfetivoCT = useMemo(() => {
    if (!filtroAtivoCT) return expandedCT
    const merged = new Set(expandedCT)
    if (visiveisCT) {
      for (const c of visiveisCT) if (!matchesCT.has(c)) merged.add(c)
    }
    return merged
  }, [expandedCT, visiveisCT, matchesCT, filtroAtivoCT])

  const flatCT = useMemo(
    () => flattenTree(treeCT, expandedEfetivoCT, visiveisCT),
    [treeCT, expandedEfetivoCT, visiveisCT],
  )

  // ── Ações sobre árvore ──────────────────────────────────────────────────
  function toggleNodeAS(codigo: string) {
    setExpandedAS(prev => {
      const n = new Set(prev)
      if (n.has(codigo)) n.delete(codigo); else n.add(codigo)
      return n
    })
  }
  function toggleNodeCT(codigo: string) {
    setExpandedCT(prev => {
      const n = new Set(prev)
      if (n.has(codigo)) n.delete(codigo); else n.add(codigo)
      return n
    })
  }
  const expandirTudoAS  = () => setExpandedAS(todosOsCodigosNonLeaves(treeAS))
  const colapsarTudoAS  = () => setExpandedAS(new Set())
  const expandirTudoCT  = () => setExpandedCT(todosOsCodigosNonLeaves(treeCT))
  const colapsarTudoCT  = () => setExpandedCT(new Set())

  // Códigos contábeis usados em mapeamentos ativos (para badge "já usada")
  const codigosCTUsados = useMemo(() => {
    const s = new Set<string>()
    for (const c of contasAS) if (c.conta_contabil) s.add(c.conta_contabil)
    return s
  }, [contasAS])

  async function vincular(ctaCT: ContabilPlanoConta) {
    if (!selASItem) {
      toast({ variant: 'destructive', title: 'Selecione antes uma conta AUTOSYSTEM' })
      return
    }
    setLinking(true)
    try {
      let r: Response
      if (selASItem.mapeamento_id) {
        r = await fetch(`/api/contabil/mapeamento-contas/${selASItem.mapeamento_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conta_contabil: ctaCT.codigo, descricao: ctaCT.descricao }),
        })
      } else {
        r = await fetch('/api/contabil/mapeamento-contas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conta_autosystem: selASItem.codigo,
            conta_contabil:   ctaCT.codigo,
            descricao:        ctaCT.descricao,
          }),
        })
      }
      const json = await r.json()
      if (!r.ok) throw new Error(json.error ?? `Erro HTTP ${r.status}`)
      toast({ title: 'Mapeamento salvo' })
      await carregarAS()
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao vincular', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setLinking(false)
    }
  }

  async function desvincular() {
    if (!selASItem?.mapeamento_id) return
    if (!confirm(`Remover o mapeamento de "${selASItem.codigo}"?`)) return
    setLinking(true)
    try {
      const r = await fetch(`/api/contabil/mapeamento-contas/${selASItem.mapeamento_id}`, { method: 'DELETE' })
      const json = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(json.error ?? `Erro HTTP ${r.status}`)
      toast({ title: 'Mapeamento removido' })
      await carregarAS()
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setLinking(false)
    }
  }

  async function limparPlanoContabil() {
    if (!confirm(`Apagar TODAS as ${contasContabil.length} contas do plano contábil? Os mapeamentos existentes ficam, mas perdem a referência.`)) return
    try {
      const r = await fetch('/api/contabil/plano-contas?all=1', { method: 'DELETE' })
      const json = await r.json()
      if (!r.ok) throw new Error(json.error ?? `Erro HTTP ${r.status}`)
      toast({ title: `${json.removidas} contas removidas` })
      await carregarCT()
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro', description: e instanceof Error ? e.message : String(e) })
    }
  }

  const totalAS       = contasAS.length
  const totalMapeadas = contasAS.filter(c => c.mapeada).length
  const totalCT       = contasContabil.length

  return (
    <>
      {/* Barra superior — seleção atual */}
      <div className="rounded-xl bg-white border border-gray-200 p-3 mb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[280px]">
            <div className="w-7 h-7 rounded-md bg-blue-50 flex items-center justify-center flex-shrink-0">
              <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wide">AS</span>
            </div>
            {selASItem ? (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <code className="font-mono text-[12px] font-bold text-gray-900">{selASItem.codigo}</code>
                  <span className={cn(
                    'text-[9.5px] uppercase font-semibold px-1 py-px rounded',
                    selASItem.natureza === 'Débito' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700',
                  )}>{selASItem.natureza}</span>
                </div>
                <p className="text-[11px] text-gray-600 truncate">{selASItem.nome}</p>
              </div>
            ) : (
              <p className="text-[12px] text-gray-400 italic">Selecione uma conta na coluna AUTOSYSTEM</p>
            )}
          </div>

          <ArrowRightLeft className={cn('w-4 h-4 flex-shrink-0', selASItem ? 'text-amber-500' : 'text-gray-300')} />

          <div className="flex items-center gap-2 flex-1 min-w-[280px]">
            <div className="w-7 h-7 rounded-md bg-amber-50 flex items-center justify-center flex-shrink-0">
              <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wide">CT</span>
            </div>
            {selCTVinculado ? (
              <div className="min-w-0 flex-1">
                <code className="font-mono text-[12px] font-bold text-amber-700">{selCTVinculado.codigo}</code>
                <p className="text-[11px] text-gray-600 truncate">{selCTVinculado.descricao || <span className="italic text-gray-400">(sem descrição)</span>}</p>
              </div>
            ) : selASItem ? (
              <p className="text-[12px] text-gray-400 italic">↳ Clique numa conta contábil para vincular</p>
            ) : (
              <p className="text-[12px] text-gray-400 italic">—</p>
            )}
            {selASItem?.mapeamento_id && (
              <button onClick={desvincular} disabled={linking}
                className="ml-auto h-7 px-2 rounded text-[11px] font-medium border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 flex items-center gap-1">
                {linking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2Off className="w-3 h-3" />}
                Desvincular
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Painéis lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* ── Plano AUTOSYSTEM (árvore) ───────────────────────────────────── */}
        <div className="rounded-xl bg-white border border-gray-200 flex flex-col h-[calc(100vh-280px)] min-h-[400px]">
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2 gap-2">
              <div className="flex items-center gap-1.5">
                <h3 className="text-[12.5px] font-semibold text-gray-800">Plano AUTOSYSTEM</h3>
                <span className="text-[10.5px] text-gray-400">({totalAS})</span>
              </div>
              <div className="flex items-center gap-0.5">
                <button onClick={expandirTudoAS} title="Expandir tudo"
                  className="h-6 w-6 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 flex items-center justify-center">
                  <ChevronsUpDown className="w-3 h-3" />
                </button>
                <button onClick={colapsarTudoAS} title="Colapsar tudo"
                  className="h-6 w-6 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 flex items-center justify-center">
                  <ChevronsDownUp className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1 text-[10.5px] mb-2 flex-wrap">
              <button onClick={() => setFiltroAS('todas')}
                className={cn('px-2 py-0.5 rounded', filtroAS === 'todas' ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-500 hover:bg-gray-100')}>
                Todas
              </button>
              <button onClick={() => setFiltroAS('naoMapeadas')}
                className={cn('px-2 py-0.5 rounded', filtroAS === 'naoMapeadas' ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-500 hover:bg-gray-100')}>
                Não mapeadas ({totalAS - totalMapeadas})
              </button>
              <button onClick={() => setFiltroAS('mapeadas')}
                className={cn('px-2 py-0.5 rounded', filtroAS === 'mapeadas' ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-500 hover:bg-gray-100')}>
                Mapeadas ({totalMapeadas})
              </button>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input type="text" value={searchAS} onChange={e => setSearchAS(e.target.value)}
                placeholder="Buscar código ou nome..."
                className="w-full h-8 pl-8 pr-3 border border-gray-200 rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingAS ? (
              <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" /></div>
            ) : flatAS.length === 0 ? (
              <p className="p-8 text-center text-[12px] text-gray-400 italic">Nenhuma conta corresponde ao filtro</p>
            ) : (
              <ul className="py-1">
                {flatAS.map(node => {
                  const c = node.item
                  const isSel       = c.codigo === selAS
                  const hasChildren = node.children.length > 0
                  const isExpanded  = expandedEfetivoAS.has(c.codigo)
                  return (
                    <li key={c.codigo}>
                      <div
                        onClick={() => setSelAS(c.codigo === selAS ? null : c.codigo)}
                        className={cn(
                          'flex items-center gap-1 hover:bg-blue-50/60 transition-colors border-l-2 cursor-pointer pr-2',
                          isSel ? 'bg-blue-50 border-blue-500' : 'border-transparent',
                        )}
                        style={{ paddingLeft: `${4 + node.depth * 14}px` }}
                      >
                        {hasChildren ? (
                          <button
                            onClick={e => { e.stopPropagation(); toggleNodeAS(c.codigo) }}
                            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded flex-shrink-0"
                          >
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </button>
                        ) : (
                          <span className="w-5 flex-shrink-0" />
                        )}
                        <code className={cn(
                          'font-mono text-[11.5px] font-semibold tabular-nums flex-shrink-0 py-1.5',
                          hasChildren ? 'text-gray-900' : 'text-gray-700',
                          isSel && 'text-blue-700',
                        )}>{c.codigo}</code>
                        <span className={cn(
                          'text-[11.5px] truncate flex-1 py-1.5',
                          hasChildren ? 'font-medium text-gray-800' : 'text-gray-700',
                          isSel && 'text-blue-800',
                        )}>{c.nome}</span>
                        {c.mapeada && (
                          <span className="flex items-center gap-0.5 text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full flex-shrink-0" title={`Mapeada para ${c.conta_contabil}`}>
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <code className="font-mono">{c.conta_contabil}</code>
                          </span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="px-4 py-2 border-t border-gray-100 text-[10.5px] text-gray-500 flex items-center justify-between">
            <span>Plano de contas do AUTOSYSTEM (tabela <code>conta</code>)</span>
            <button onClick={carregarAS} className="text-gray-400 hover:text-gray-700" title="Recarregar">
              <RefreshCw className={cn('w-3 h-3', loadingAS && 'animate-spin')} />
            </button>
          </div>
        </div>

        {/* ── Plano Contábil (árvore) ─────────────────────────────────────── */}
        <div className="rounded-xl bg-white border border-gray-200 flex flex-col h-[calc(100vh-280px)] min-h-[400px]">
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2 gap-2">
              <div className="flex items-center gap-1.5">
                <h3 className="text-[12.5px] font-semibold text-gray-800">Plano Contábil</h3>
                <span className="text-[10.5px] text-gray-400">({totalCT})</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={expandirTudoCT} title="Expandir tudo"
                  className="h-6 w-6 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 flex items-center justify-center">
                  <ChevronsUpDown className="w-3 h-3" />
                </button>
                <button onClick={colapsarTudoCT} title="Colapsar tudo"
                  className="h-6 w-6 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 flex items-center justify-center">
                  <ChevronsDownUp className="w-3 h-3" />
                </button>
                <button onClick={() => setShowImport(true)}
                  className="h-7 px-2 rounded bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold flex items-center gap-1">
                  <Upload className="w-3 h-3" /> Importar Excel
                </button>
                {totalCT > 0 && (
                  <button onClick={limparPlanoContabil} title="Apagar todo o plano contábil"
                    className="h-7 w-7 rounded border border-gray-200 text-red-500 hover:bg-red-50 flex items-center justify-center">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input type="text" value={searchCT} onChange={e => setSearchCT(e.target.value)}
                placeholder="Buscar código ou descrição..."
                className="w-full h-8 pl-8 pr-3 border border-gray-200 rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-amber-400" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingCT ? (
              <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" /></div>
            ) : contasContabil.length === 0 ? (
              <div className="p-8 text-center">
                <FileSpreadsheet className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-[12px] text-gray-500 mb-1">Plano contábil vazio</p>
                <p className="text-[11px] text-gray-400 mb-3">Importe o plano de contas que a contabilidade usa</p>
                <button onClick={() => setShowImport(true)}
                  className="h-8 px-3 rounded bg-amber-600 hover:bg-amber-700 text-white text-[12px] font-semibold inline-flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" /> Importar Excel
                </button>
              </div>
            ) : flatCT.length === 0 ? (
              <p className="p-8 text-center text-[12px] text-gray-400 italic">Nada encontrado</p>
            ) : (
              <ul className="py-1">
                {flatCT.map(node => {
                  const c = node.item
                  const ehVinculadaAtual = selCTVinculado?.id === c.id
                  const jaUsada          = codigosCTUsados.has(c.codigo)
                  const hasChildren      = node.children.length > 0
                  const isExpanded       = expandedEfetivoCT.has(c.codigo)
                  const disabled         = !selASItem || linking

                  return (
                    <li key={c.id}>
                      <div
                        onClick={() => !disabled && vincular(c)}
                        className={cn(
                          'flex items-center gap-1 transition-colors border-l-2 pr-2',
                          ehVinculadaAtual
                            ? 'bg-amber-50 border-amber-500'
                            : disabled
                              ? 'border-transparent cursor-not-allowed'
                              : 'hover:bg-amber-50/60 border-transparent cursor-pointer',
                        )}
                        style={{ paddingLeft: `${4 + node.depth * 14}px` }}
                        title={ehVinculadaAtual ? 'Já vinculada à AUTOSYSTEM selecionada'
                              : disabled ? 'Selecione uma conta AUTOSYSTEM antes' : `Vincular AUTOSYSTEM "${selASItem?.codigo}" a "${c.codigo}"`}
                      >
                        {hasChildren ? (
                          <button
                            onClick={e => { e.stopPropagation(); toggleNodeCT(c.codigo) }}
                            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded flex-shrink-0"
                          >
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </button>
                        ) : (
                          <span className="w-5 flex-shrink-0" />
                        )}
                        <code className={cn(
                          'font-mono text-[11.5px] font-semibold tabular-nums flex-shrink-0 py-1.5',
                          ehVinculadaAtual ? 'text-amber-700' : disabled ? 'text-gray-400' : hasChildren ? 'text-gray-900' : 'text-gray-700',
                        )}>{c.codigo}</code>
                        <span className={cn(
                          'text-[11.5px] truncate flex-1 py-1.5',
                          ehVinculadaAtual ? 'text-amber-800 font-medium' : disabled ? 'text-gray-400' : hasChildren ? 'font-medium text-gray-800' : 'text-gray-700',
                        )}>
                          {c.descricao || <span className="italic text-gray-400">(sem descrição)</span>}
                        </span>
                        {ehVinculadaAtual && (
                          <span className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 flex-shrink-0">
                            <Link2 className="w-2.5 h-2.5" /> vinculada
                          </span>
                        )}
                        {!ehVinculadaAtual && jaUsada && (
                          <span className="text-[9.5px] text-gray-400 flex-shrink-0" title="Usada em outro mapeamento">
                            já usada
                          </span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="px-4 py-2 border-t border-gray-100 text-[10.5px] text-gray-500 flex items-center justify-between">
            <span>Plano externo importado da contabilidade</span>
            <button onClick={carregarCT} className="text-gray-400 hover:text-gray-700" title="Recarregar">
              <RefreshCw className={cn('w-3 h-3', loadingCT && 'animate-spin')} />
            </button>
          </div>
        </div>
      </div>

      {selASItem && !selASItem.mapeada && (
        <div className="mt-3 flex items-start gap-2 p-3 rounded-md bg-blue-50 border border-blue-200 text-blue-800 text-[12px]">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>
            <code className="font-mono font-semibold">{selASItem.codigo}</code> ainda não tem destino contábil.
            Clique numa conta na coluna direita para criar o vínculo.
            {totalCT === 0 && <strong className="block mt-0.5">Importe primeiro o plano da contabilidade.</strong>}
          </p>
        </div>
      )}

      {showImport && (
        <ImportarPlanoModal
          onClose={() => setShowImport(false)}
          onImported={(info) => {
            toast({
              title: 'Plano importado',
              description: `${info.total_gravadas} contas gravadas (${info.total_validas} válidas / ${info.total_recebidas} recebidas)`,
            })
            carregarCT()
          }}
        />
      )}
    </>
  )
}
