'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ChevronRight, ChevronDown, Database, Loader2, AlertCircle,
  Search, Save, Layers, Check, Minus, Boxes,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils/cn'
import type { MascaraLinha } from '@/types/database.types'

// ─── Tipos ────────────────────────────────────────────────────

interface PlanoContaRow {
  hierarquia: string
  nome:       string
  // grid vem como string do AUTOSYSTEM (pg serializa bigint como string)
  // e como number do Supabase (PostgREST). Normalizamos para string em todo o componente.
  grid:       string
  natureza:   'Débito' | 'Crédito'
}

interface ContaNode {
  conta:    PlanoContaRow
  children: ContaNode[]
}

interface Mapeamento {
  linha_id:   string
  conta_grid: string
}

interface GrupoProdutoRow {
  id:     string
  codigo: number
  nome:   string
}

interface MapeamentoGrupo {
  linha_id:   string
  grupo_grid: string
}

type Origem = 'contas' | 'grupos'

// ─── Helpers ──────────────────────────────────────────────────

function buildContasTree(contas: PlanoContaRow[]): ContaNode[] {
  const sorted = [...contas].sort((a, b) =>
    a.hierarquia.localeCompare(b.hierarquia, 'pt-BR', { numeric: true })
  )
  const map = new Map<string, ContaNode>()
  sorted.forEach(c => map.set(c.hierarquia, { conta: c, children: [] }))

  const roots: ContaNode[] = []
  sorted.forEach(c => {
    const node = map.get(c.hierarquia)!
    const parts = c.hierarquia.split('.').filter(Boolean)
    if (parts.length <= 1) {
      roots.push(node)
      return
    }
    // Procura o ancestral mais longo presente no map (lida com saltos de hierarquia)
    let parentCodigo: string | null = null
    for (let i = parts.length - 1; i >= 1; i--) {
      const cand = parts.slice(0, i).join('.')
      if (map.has(cand)) { parentCodigo = cand; break }
    }
    if (parentCodigo) map.get(parentCodigo)!.children.push(node)
    else              roots.push(node)
  })
  return roots
}

function flattenLinhas(linhas: MascaraLinha[], parent: string | null = null, depth = 0): { linha: MascaraLinha; depth: number }[] {
  const out: { linha: MascaraLinha; depth: number }[] = []
  linhas
    .filter(l => l.parent_id === parent)
    .sort((a, b) => a.ordem - b.ordem)
    .forEach(l => {
      out.push({ linha: l, depth })
      out.push(...flattenLinhas(linhas, l.id, depth + 1))
    })
  return out
}

// ─── Componente ───────────────────────────────────────────────

interface Props {
  mascaraId: string
  linhas:    MascaraLinha[]
}

export function MapeamentosPanel({ mascaraId, linhas }: Props) {
  const supabase = createClient()

  const [contas, setContas]               = useState<PlanoContaRow[] | null>(null)
  const [loadingContas, setLoadingContas] = useState(true)
  const [erro, setErro]                   = useState<string | null>(null)

  const [mapeamentos, setMapeamentos]     = useState<Mapeamento[]>([])
  const [loadingMaps, setLoadingMaps]     = useState(true)

  const [selectedLinhaId, setSelectedLinhaId] = useState<string | null>(null)
  // pending: ações pendentes por grid — 'current' = mapear à linha selecionada; 'unmap' = remover de qualquer linha
  const [pending, setPending]                 = useState<Map<string, 'current' | 'unmap'>>(new Map())
  const [saving, setSaving]                   = useState(false)

  const [filtro, setFiltro]                   = useState('')
  const [expanded, setExpanded]               = useState<Set<string>>(new Set())

  // ── Origem ativa (Plano de Contas / Grupos de Produtos) ────
  const [origem, setOrigem]                   = useState<Origem>('contas')

  // ── Grupos de produtos (vendas/custos) ─────────────────────
  const [grupos, setGrupos]                       = useState<GrupoProdutoRow[] | null>(null)
  const [loadingGrupos, setLoadingGrupos]         = useState(true)
  const [erroGrupos, setErroGrupos]               = useState<string | null>(null)
  const [mapeamentosGrupos, setMapeamentosGrupos] = useState<MapeamentoGrupo[]>([])
  const [loadingMapsGrupos, setLoadingMapsGrupos] = useState(true)
  const [pendingGrupos, setPendingGrupos]         = useState<Map<string, 'current' | 'unmap'>>(new Map())

  const tree = useMemo(() => contas ? buildContasTree(contas) : [], [contas])
  const linhasFlat = useMemo(() => flattenLinhas(linhas), [linhas])

  // Linhas elegíveis para mapeamento: apenas tipo "grupo".
  // (Subtotais são calculados, não recebem contas diretamente.)
  const linhasMapeaveis = useMemo(
    () => linhasFlat.filter(({ linha }) => linha.tipo_linha === 'grupo'),
    [linhasFlat]
  )

  const linhaIdByContaGrid = useMemo(() => {
    const m = new Map<string, string>()
    mapeamentos.forEach(map => m.set(map.conta_grid, map.linha_id))
    return m
  }, [mapeamentos])

  const linhaIdByGrupoGrid = useMemo(() => {
    const m = new Map<string, string>()
    mapeamentosGrupos.forEach(map => m.set(map.grupo_grid, map.linha_id))
    return m
  }, [mapeamentosGrupos])

  // Contagem combinada (contas + grupos) por linha — info discreta na lista
  const totalCountByLinhaId = useMemo(() => {
    const m = new Map<string, number>()
    mapeamentos.forEach(map => m.set(map.linha_id, (m.get(map.linha_id) ?? 0) + 1))
    mapeamentosGrupos.forEach(map => m.set(map.linha_id, (m.get(map.linha_id) ?? 0) + 1))
    return m
  }, [mapeamentos, mapeamentosGrupos])

  const linhaNomeById = useMemo(() => {
    const m = new Map<string, string>()
    linhas.forEach(l => m.set(l.id, l.nome))
    return m
  }, [linhas])

  const dirty = origem === 'contas' ? pending.size > 0 : pendingGrupos.size > 0

  // Estado visual de cada conta (grid).
  // - 'current' = mapeada (no DB ou pending) à linha SELECIONADA — checkbox normal
  // - 'other'   = mapeada a outra linha qualquer dessa máscara — checkbox marcado + texto opaco
  // - 'unchecked' = não mapeada
  function getCheckState(grid: string): 'unchecked' | 'current' | 'other' {
    const p = pending.get(grid)
    if (p === 'unmap')   return 'unchecked'
    if (p === 'current') return 'current'
    const dbLinha = linhaIdByContaGrid.get(grid)
    if (dbLinha === selectedLinhaId) return 'current'
    if (dbLinha)                     return 'other'
    return 'unchecked'
  }

  // Mesma lógica de getCheckState, mas para grupos de produtos
  function getCheckStateGrupo(grid: string): 'unchecked' | 'current' | 'other' {
    const p = pendingGrupos.get(grid)
    if (p === 'unmap')   return 'unchecked'
    if (p === 'current') return 'current'
    const dbLinha = linhaIdByGrupoGrid.get(grid)
    if (dbLinha === selectedLinhaId) return 'current'
    if (dbLinha)                     return 'other'
    return 'unchecked'
  }

  function toggleGrupo(grid: string) {
    if (!selectedLinhaId) return
    const state = getCheckStateGrupo(grid)
    setPendingGrupos(prev => {
      const next = new Map(prev)
      const dbLinha = linhaIdByGrupoGrid.get(grid)
      if (state === 'unchecked') {
        if (dbLinha === selectedLinhaId) next.delete(grid)
        else                              next.set(grid, 'current')
      } else {
        if (!dbLinha) next.delete(grid)
        else          next.set(grid, 'unmap')
      }
      return next
    })
  }


  // ── Carga: plano de contas ─────────────────────────────────
  useEffect(() => {
    let canceled = false
    fetch('/api/autosystem/plano-contas')
      .then(async r => {
        const json = await r.json()
        if (canceled) return
        if (!r.ok || json.error) setErro(json.error ?? `Erro HTTP ${r.status}`)
        else {
          // Normaliza grid para string (pg pode enviar como string, JSON pode ter quebrado)
          const raw = (json.contas ?? []) as Array<Omit<PlanoContaRow, 'grid'> & { grid: string | number }>
          const contas: PlanoContaRow[] = raw.map(c => ({ ...c, grid: String(c.grid) }))
          setContas(contas)
          // Expande as raízes por padrão (mostra o nível 1)
          const rootCodigos = contas
            .filter(c => c.hierarquia.split('.').filter(Boolean).length === 1)
            .map(c => c.hierarquia)
          setExpanded(new Set(rootCodigos))
        }
      })
      .catch(e => { if (!canceled) setErro(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!canceled) setLoadingContas(false) })
    return () => { canceled = true }
  }, [])

  // ── Carga: mapeamentos da máscara ──────────────────────────
  async function carregarMapeamentos() {
    setLoadingMaps(true)
    const { data, error } = await supabase
      .from('mascaras_mapeamentos')
      .select('linha_id, conta_grid')
      .eq('mascara_id', mascaraId)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao carregar mapeamentos', description: error.message })
      setLoadingMaps(false)
      return
    }
    // Coerção: PostgREST retorna conta_grid como number/string dependendo do valor.
    // Padronizamos para string para casar com PlanoContaRow.grid.
    const rows = (data ?? []) as Array<{ linha_id: string; conta_grid: string | number }>
    setMapeamentos(rows.map(r => ({ linha_id: r.linha_id, conta_grid: String(r.conta_grid) })))
    setLoadingMaps(false)
  }

  useEffect(() => { carregarMapeamentos() }, [mascaraId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Carga: grupos de produtos ──────────────────────────────
  useEffect(() => {
    let canceled = false
    fetch('/api/autosystem/grupos-produto')
      .then(async r => {
        const json = await r.json()
        if (canceled) return
        if (!r.ok || json.error) setErroGrupos(json.error ?? `Erro HTTP ${r.status}`)
        else {
          const raw = (json.grupos ?? []) as Array<Omit<GrupoProdutoRow, 'id'> & { id: string | number }>
          setGrupos(raw.map(g => ({ ...g, id: String(g.id) })))
        }
      })
      .catch(e => { if (!canceled) setErroGrupos(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!canceled) setLoadingGrupos(false) })
    return () => { canceled = true }
  }, [])

  // ── Carga: mapeamentos de grupos da máscara ────────────────
  async function carregarMapeamentosGrupos() {
    setLoadingMapsGrupos(true)
    const { data, error } = await supabase
      .from('mascaras_mapeamentos_grupos')
      .select('linha_id, grupo_grid')
      .eq('mascara_id', mascaraId)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao carregar mapeamentos de grupos', description: error.message })
      setLoadingMapsGrupos(false)
      return
    }
    const rows = (data ?? []) as Array<{ linha_id: string; grupo_grid: string | number }>
    setMapeamentosGrupos(rows.map(r => ({ linha_id: r.linha_id, grupo_grid: String(r.grupo_grid) })))
    setLoadingMapsGrupos(false)
  }

  useEffect(() => { carregarMapeamentosGrupos() }, [mascaraId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-seleciona a primeira linha mapeável após carga
  useEffect(() => {
    if (selectedLinhaId || loadingMaps || !linhasMapeaveis.length) return
    setSelectedLinhaId(linhasMapeaveis[0].linha.id)
  }, [linhasMapeaveis, loadingMaps, selectedLinhaId])

  // ── Handlers ───────────────────────────────────────────────
  function selectLinha(id: string) {
    if (id === selectedLinhaId) return
    if (dirty) {
      const ok = window.confirm('Há alterações não salvas. Descartar?')
      if (!ok) return
    }
    setSelectedLinhaId(id)
    setPending(new Map())
    setPendingGrupos(new Map())
  }

  function switchOrigem(novaOrigem: Origem) {
    if (novaOrigem === origem) return
    if (dirty) {
      const ok = window.confirm('Há alterações não salvas. Descartar?')
      if (!ok) return
    }
    setOrigem(novaOrigem)
    setPending(new Map())
    setPendingGrupos(new Map())
  }

  function toggleExpand(codigo: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(codigo)) next.delete(codigo)
      else next.add(codigo)
      return next
    })
  }

  function getDescendantGrids(node: ContaNode): string[] {
    const out: string[] = [node.conta.grid]
    node.children.forEach(c => out.push(...getDescendantGrids(c)))
    return out
  }

  function getNodeCheckState(node: ContaNode): 'unchecked' | 'checked' | 'indeterminate' {
    const grids = getDescendantGrids(node)
    let count = 0
    for (const g of grids) if (getCheckState(g) !== 'unchecked') count++
    if (count === 0)            return 'unchecked'
    if (count === grids.length) return 'checked'
    return 'indeterminate'
  }

  function toggleNode(node: ContaNode) {
    if (!selectedLinhaId) return
    const grids = getDescendantGrids(node)
    const allChecked = grids.every(g => getCheckState(g) !== 'unchecked')
    setPending(prev => {
      const next = new Map(prev)
      grids.forEach(grid => {
        const dbLinha = linhaIdByContaGrid.get(grid)
        if (allChecked) {
          // Desmarcar todas — libera de qualquer linha
          if (!dbLinha) next.delete(grid)
          else          next.set(grid, 'unmap')
        } else {
          // Marcar todas para a linha selecionada
          if (dbLinha === selectedLinhaId) next.delete(grid)
          else                              next.set(grid, 'current')
        }
      })
      return next
    })
  }

  async function handleSalvar() {
    if (!selectedLinhaId) return
    setSaving(true)

    const toAdd:    string[] = []
    const toRemove: string[] = []
    pending.forEach((acao, grid) => {
      if (acao === 'current') toAdd.push(grid)
      else                    toRemove.push(grid)
    })

    // Como existe UNIQUE (mascara_id, conta_grid), as contas adicionadas
    // talvez já estejam mapeadas a outras linhas dessa máscara — removemos
    // primeiro qualquer vínculo anterior antes de inserir o novo.
    if (toAdd.length > 0) {
      const { error: e1 } = await supabase
        .from('mascaras_mapeamentos')
        .delete()
        .eq('mascara_id', mascaraId)
        .in('conta_grid', toAdd)
      if (e1) {
        toast({ variant: 'destructive', title: 'Erro ao salvar', description: e1.message })
        setSaving(false); return
      }
      const { error: e2 } = await supabase
        .from('mascaras_mapeamentos')
        .insert(toAdd.map(g => ({ mascara_id: mascaraId, linha_id: selectedLinhaId, conta_grid: g })))
      if (e2) {
        toast({ variant: 'destructive', title: 'Erro ao salvar', description: e2.message })
        setSaving(false); return
      }
    }

    // Remove de qualquer linha dessa máscara (não só da selecionada).
    if (toRemove.length > 0) {
      const { error } = await supabase
        .from('mascaras_mapeamentos')
        .delete()
        .eq('mascara_id', mascaraId)
        .in('conta_grid', toRemove)
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message })
        setSaving(false); return
      }
    }

    toast({ title: 'Mapeamento salvo' })
    // Recarrega ANTES de limpar pending — evita o flicker em que os checkboxes
    // ficam vazios entre o limpar do pending e a chegada dos novos dados do banco.
    await carregarMapeamentos()
    setPending(new Map())
    setSaving(false)
  }

  function handleCancelar() {
    setPending(new Map())
  }

  // ── Save / Cancel para grupos de produtos ──────────────────
  async function handleSalvarGrupos() {
    if (!selectedLinhaId) return
    setSaving(true)

    const toAdd:    string[] = []
    const toRemove: string[] = []
    pendingGrupos.forEach((acao, grid) => {
      if (acao === 'current') toAdd.push(grid)
      else                    toRemove.push(grid)
    })

    if (toAdd.length > 0) {
      const { error: e1 } = await supabase
        .from('mascaras_mapeamentos_grupos')
        .delete()
        .eq('mascara_id', mascaraId)
        .in('grupo_grid', toAdd)
      if (e1) {
        toast({ variant: 'destructive', title: 'Erro ao salvar', description: e1.message })
        setSaving(false); return
      }
      const { error: e2 } = await supabase
        .from('mascaras_mapeamentos_grupos')
        .insert(toAdd.map(g => ({ mascara_id: mascaraId, linha_id: selectedLinhaId, grupo_grid: g })))
      if (e2) {
        toast({ variant: 'destructive', title: 'Erro ao salvar', description: e2.message })
        setSaving(false); return
      }
    }

    if (toRemove.length > 0) {
      const { error } = await supabase
        .from('mascaras_mapeamentos_grupos')
        .delete()
        .eq('mascara_id', mascaraId)
        .in('grupo_grid', toRemove)
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message })
        setSaving(false); return
      }
    }

    toast({ title: 'Mapeamento salvo' })
    await carregarMapeamentosGrupos()
    setPendingGrupos(new Map())
    setSaving(false)
  }

  function handleCancelarGrupos() {
    setPendingGrupos(new Map())
  }

  // Filtro: marca códigos que casam (eles e ancestrais) para forçar expansão
  const filtroMatched = useMemo(() => {
    if (!filtro.trim() || !contas) return null
    const q = filtro.trim().toLowerCase()
    const out = new Set<string>()
    contas.forEach(c => {
      if (
        c.hierarquia.toLowerCase().includes(q) ||
        c.nome.toLowerCase().includes(q) ||
        String(c.grid).includes(q)
      ) {
        const parts = c.hierarquia.split('.').filter(Boolean)
        for (let i = 1; i <= parts.length; i++) out.add(parts.slice(0, i).join('.'))
      }
    })
    return out
  }, [filtro, contas])

  function nodeMatches(node: ContaNode): boolean {
    if (!filtroMatched) return true
    return filtroMatched.has(node.conta.hierarquia)
  }

  // Lista filtrada de grupos de produtos (filtro simples — sem hierarquia)
  const gruposFiltrados = useMemo(() => {
    if (!grupos) return []
    if (!filtro.trim()) return grupos
    const q = filtro.trim().toLowerCase()
    return grupos.filter(g =>
      g.nome.toLowerCase().includes(q) ||
      String(g.codigo).includes(q)   ||
      g.id.includes(q)
    )
  }, [grupos, filtro])

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
      {/* ── Coluna 1: Linhas da máscara ─────────────────── */}
      <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100">Linhas da máscara</h2>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              Selecione uma linha para mapear contas
            </p>
          </div>
        </div>

        <div className="overflow-y-auto max-h-[64vh]">
          {loadingMaps ? (
            <div className="flex justify-center py-10 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : !linhasMapeaveis.length ? (
            <p className="px-4 py-6 text-center text-[12.5px] text-gray-500 dark:text-gray-400">
              Nenhuma linha do tipo Grupo cadastrada na aba Máscara.
            </p>
          ) : (
            linhasMapeaveis.map(({ linha, depth }) => {
              const ativa = linha.id === selectedLinhaId
              const total = totalCountByLinhaId.get(linha.id) ?? 0
              return (
                <button
                  key={linha.id}
                  onClick={() => selectLinha(linha.id)}
                  style={{ paddingLeft: 12 + depth * 14 }}
                  className={cn(
                    'w-full flex items-center gap-2 pr-3 py-2 text-left border-b border-gray-100 dark:border-gray-800 last:border-b-0 transition-colors',
                    ativa
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/40'
                  )}
                >
                  <span className="flex-1 text-[12.5px] font-medium uppercase tracking-tight truncate">
                    {linha.nome}
                  </span>
                  {total > 0 && (
                    <span className={cn(
                      'text-[11px] flex-shrink-0',
                      ativa
                        ? 'text-blue-600/70 dark:text-blue-400/70'
                        : 'text-gray-400 dark:text-gray-500'
                    )}>
                      {total}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Coluna 2: Origem do mapeamento (Contas / Grupos) ─ */}
      <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col">
        {/* Sub-tabs Plano de Contas / Grupos de Produtos */}
        <div className="flex border-b border-gray-200 dark:border-gray-800">
          {([
            { key: 'contas', label: 'Plano de Contas',     icon: Database },
            { key: 'grupos', label: 'Grupos de Produtos',  icon: Boxes },
          ] as const).map(t => {
            const Icon   = t.icon
            const active = origem === t.key
            return (
              <button
                key={t.key}
                onClick={() => switchOrigem(t.key)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 text-[12.5px] font-semibold border-b-2 -mb-px transition-colors',
                  active
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Header com filtro */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            {origem === 'contas'
              ? <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              : <Boxes    className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100">
              {origem === 'contas' ? 'Plano de Contas' : 'Grupos de Produtos'}
            </h2>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              {selectedLinhaId
                ? <>Vinculando {origem === 'contas' ? 'contas' : 'grupos'} a <strong className="text-gray-900 dark:text-gray-100">{linhaNomeById.get(selectedLinhaId)}</strong></>
                : 'Selecione uma linha à esquerda'}
            </p>
          </div>
          <div className="relative w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Filtrar"
              className="w-full pl-8 pr-3 h-9 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-[12.5px] focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="overflow-y-auto max-h-[64vh]">
          {origem === 'contas' ? (
            loadingContas ? (
              <div className="flex justify-center py-10 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : erro ? (
              <div className="flex items-start gap-2 mx-4 my-4 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-[13px]">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Erro ao carregar plano de contas</p>
                  <p className="text-[12px] opacity-80 break-words">{erro}</p>
                </div>
              </div>
            ) : !tree.length ? (
              <p className="text-center py-10 text-[13px] text-gray-500 dark:text-gray-400">Nenhuma conta encontrada</p>
            ) : (
              tree.map(node => (
                <ContaTreeNode
                  key={node.conta.hierarquia}
                  node={node}
                  depth={0}
                  expanded={expanded}
                  forceExpand={filtroMatched}
                  disabled={!selectedLinhaId}
                  getCheckState={getCheckState}
                  getNodeCheckState={getNodeCheckState}
                  toggleExpand={toggleExpand}
                  toggleNode={toggleNode}
                  nodeMatches={nodeMatches}
                />
              ))
            )
          ) : (
            loadingGrupos ? (
              <div className="flex justify-center py-10 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : erroGrupos ? (
              <div className="flex items-start gap-2 mx-4 my-4 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-[13px]">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Erro ao carregar grupos de produtos</p>
                  <p className="text-[12px] opacity-80 break-words">{erroGrupos}</p>
                </div>
              </div>
            ) : !gruposFiltrados.length ? (
              <p className="text-center py-10 text-[13px] text-gray-500 dark:text-gray-400">
                {filtro ? 'Nenhum grupo corresponde ao filtro' : 'Nenhum grupo de produto encontrado'}
              </p>
            ) : (
              gruposFiltrados.map(grupo => {
                const state     = getCheckStateGrupo(grupo.id)
                const isCurrent = state === 'current'
                const isOther   = state === 'other'
                const disabled  = !selectedLinhaId
                return (
                  <div
                    key={grupo.id}
                    className={cn(
                      'flex items-center gap-3 h-10 px-3 border-b border-gray-100 dark:border-gray-800 last:border-b-0 transition-colors',
                      isCurrent && 'bg-blue-50 dark:bg-blue-900/20',
                      !disabled && !isCurrent && 'hover:bg-gray-50 dark:hover:bg-gray-800/40',
                      !disabled &&  isCurrent && 'hover:bg-blue-100 dark:hover:bg-blue-900/30',
                    )}
                  >
                    <button
                      onClick={() => !disabled && toggleGrupo(grupo.id)}
                      disabled={disabled}
                      className={cn(
                        'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
                        disabled && 'cursor-not-allowed opacity-50',
                        !disabled && state === 'unchecked' && 'border-gray-300 dark:border-gray-600 hover:border-blue-500',
                        !disabled && state !== 'unchecked' && 'border-blue-600 bg-blue-600 text-white',
                      )}
                    >
                      {state !== 'unchecked' && <Check className="w-3 h-3" />}
                    </button>
                    <div className={cn('flex-1 flex items-center gap-3 min-w-0', isOther && 'opacity-50')}>
                      <span className="text-[11px] font-mono text-gray-400 dark:text-gray-500 w-12 truncate flex-shrink-0">
                        {grupo.codigo}
                      </span>
                      <span className="flex-1 text-[12.5px] text-gray-900 dark:text-gray-100 uppercase tracking-tight truncate">
                        {grupo.nome}
                      </span>
                    </div>
                  </div>
                )
              })
            )
          )}
        </div>

        {/* Barra de ações */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
          <span className="text-[12px] text-gray-500 dark:text-gray-400 flex-1">
            {dirty && (() => {
              const n = origem === 'contas' ? pending.size : pendingGrupos.size
              return `${n} alteração${n === 1 ? '' : 'ões'} pendente${n === 1 ? '' : 's'}`
            })()}
          </span>
          <button
            onClick={origem === 'contas' ? handleCancelar : handleCancelarGrupos}
            disabled={!dirty || saving}
            className="px-3 h-9 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-[12.5px] font-medium hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancelar
          </button>
          <button
            onClick={origem === 'contas' ? handleSalvar : handleSalvarGrupos}
            disabled={!dirty || saving || !selectedLinhaId}
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-[12.5px] font-semibold hover:bg-black dark:hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tree node (recursivo) ────────────────────────────────────

interface NodeProps {
  node:        ContaNode
  depth:       number
  expanded:    Set<string>
  forceExpand: Set<string> | null
  disabled:    boolean
  getCheckState:     (grid: string) => 'unchecked' | 'current' | 'other'
  getNodeCheckState: (n: ContaNode) => 'unchecked' | 'checked' | 'indeterminate'
  toggleExpand:      (codigo: string) => void
  toggleNode:        (n: ContaNode) => void
  nodeMatches:       (n: ContaNode) => boolean
}

function ContaTreeNode(props: NodeProps) {
  const { node, depth, expanded, forceExpand, disabled,
    getCheckState, getNodeCheckState, toggleExpand, toggleNode, nodeMatches } = props

  if (!nodeMatches(node) && !node.children.some(c => recursiveMatches(c, nodeMatches))) {
    return null
  }

  const hasChildren = node.children.length > 0
  const isOpen = forceExpand
    ? forceExpand.has(node.conta.hierarquia)
    : expanded.has(node.conta.hierarquia)
  const treeState = getNodeCheckState(node)
  const ownState  = getCheckState(node.conta.grid)
  const isCredor  = node.conta.natureza === 'Crédito'
  const isCurrent = ownState === 'current'
  const isOther   = ownState === 'other'

  return (
    <>
      <div
        style={{ paddingLeft: 12 + depth * 22 }}
        className={cn(
          'flex items-center gap-2 h-10 pr-3 border-b border-gray-100 dark:border-gray-800 last:border-b-0 transition-colors',
          isCurrent && 'bg-blue-50 dark:bg-blue-900/20',
          !disabled && !isCurrent && 'hover:bg-gray-50 dark:hover:bg-gray-800/40',
          !disabled &&  isCurrent && 'hover:bg-blue-100 dark:hover:bg-blue-900/30',
        )}
      >
        {/* Chevron de expansão */}
        {hasChildren ? (
          <button
            onClick={() => toggleExpand(node.conta.hierarquia)}
            disabled={!!forceExpand}
            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex-shrink-0 disabled:opacity-50"
          >
            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-5 h-5 flex-shrink-0" />
        )}

        {/* Checkbox — clicar marca/desmarca a conta na linha selecionada.
            Para contas em outras linhas, o primeiro clique libera (desmarca);
            depois o usuário pode trocar de grupo e marcar lá. */}
        <button
          onClick={() => !disabled && toggleNode(node)}
          disabled={disabled}
          className={cn(
            'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
            disabled && 'cursor-not-allowed opacity-50',
            !disabled && treeState === 'unchecked'     && 'border-gray-300 dark:border-gray-600 hover:border-blue-500',
            !disabled && treeState === 'checked'       && 'border-blue-600 bg-blue-600 text-white',
            !disabled && treeState === 'indeterminate' && 'border-blue-500 bg-blue-500 text-white',
          )}
        >
          {treeState === 'checked'       && <Check className="w-3 h-3" />}
          {treeState === 'indeterminate' && <Minus className="w-3 h-3" />}
        </button>

        {/* Bloco de texto — opacidade reduzida quando a conta está mapeada a outra linha */}
        <div className={cn('flex-1 flex items-center gap-2 min-w-0', isOther && 'opacity-50')}>
          <span className="text-[11px] font-mono text-gray-400 dark:text-gray-500 w-20 truncate flex-shrink-0">
            {node.conta.hierarquia}
          </span>
          <span className="flex-1 text-[12.5px] text-gray-900 dark:text-gray-100 truncate">
            {node.conta.nome}
          </span>
          <span className={cn(
            'text-[10.5px] font-medium px-2 py-0.5 rounded-full flex-shrink-0',
            isCredor
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
          )}>
            {node.conta.natureza}
          </span>
        </div>
      </div>

      {/* Filhos */}
      {hasChildren && isOpen && node.children.map(child => (
        <ContaTreeNode
          key={child.conta.hierarquia}
          {...props}
          node={child}
          depth={depth + 1}
        />
      ))}
    </>
  )
}

function recursiveMatches(node: ContaNode, matches: (n: ContaNode) => boolean): boolean {
  if (matches(node)) return true
  return node.children.some(c => recursiveMatches(c, matches))
}
