'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, MeasuringStrategy, PointerSensor,
  closestCenter, useSensor, useSensors,
  type DragStartEvent, type DragMoveEvent, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowLeft, Plus, GripVertical, ChevronDown, Layers,
  Pencil, Trash2, Loader2, X, Equal, Database, AlertCircle, Search,
} from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils/cn'
import type {
  Mascara, MascaraLinha, TipoMascara, TipoLinhaMascara,
} from '@/types/database.types'

// ─── Tree helpers ─────────────────────────────────────────────

interface FlatItem extends MascaraLinha {
  depth: number
}

const INDENT = 28

function flattenTree(linhas: MascaraLinha[], parent: string | null = null, depth = 0): FlatItem[] {
  const out: FlatItem[] = []
  linhas
    .filter(l => l.parent_id === parent)
    .sort((a, b) => a.ordem - b.ordem)
    .forEach(l => {
      out.push({ ...l, depth })
      out.push(...flattenTree(linhas, l.id, depth + 1))
    })
  return out
}

function getDescendantIds(items: FlatItem[], id: string): string[] {
  const idx = items.findIndex(i => i.id === id)
  if (idx === -1) return []
  const baseDepth = items[idx].depth
  const out: string[] = []
  for (let i = idx + 1; i < items.length; i++) {
    if (items[i].depth > baseDepth) out.push(items[i].id)
    else break
  }
  return out
}

function projectDrop(
  items: FlatItem[],
  activeId: string,
  overId: string,
  dragOffsetX: number,
): { depth: number; parentId: string | null } | null {
  const activeIndex = items.findIndex(i => i.id === activeId)
  const overIndex   = items.findIndex(i => i.id === overId)
  if (activeIndex === -1 || overIndex === -1) return null

  const newItems = arrayMove(items, activeIndex, overIndex)
  const previous = newItems[overIndex - 1]
  const next     = newItems[overIndex + 1]

  const dragDepth   = Math.round(dragOffsetX / INDENT)
  const projected   = items[activeIndex].depth + dragDepth
  const maxDepth    = previous ? previous.depth + 1 : 0
  const minDepth    = next ? next.depth : 0

  let depth = projected
  if (depth >= maxDepth) depth = maxDepth
  if (depth <  minDepth) depth = minDepth

  let parentId: string | null = null
  if (depth > 0 && previous) {
    if (depth === previous.depth)        parentId = previous.parent_id
    else if (depth > previous.depth)     parentId = previous.id
    else {
      parentId = newItems
        .slice(0, overIndex)
        .reverse()
        .find(i => i.depth === depth)?.parent_id ?? null
    }
  }
  return { depth, parentId }
}

// ─── Sortable row ─────────────────────────────────────────────

interface RowProps {
  item: FlatItem
  projectedDepth: number | null
  onEdit: () => void
  onDelete: () => void
  onAddChild: () => void
}

function SortableRow({ item, projectedDepth, onEdit, onDelete, onAddChild }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const depth = projectedDepth ?? item.depth
  const isSubtotal = item.tipo_linha === 'subtotal'

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        paddingLeft: 12 + depth * INDENT,
      }}
      className={cn(
        'group flex items-center gap-2 h-12 pr-3 border-b border-gray-100 dark:border-gray-800 last:border-b-0 bg-white dark:bg-gray-900 transition-colors',
        isDragging && 'opacity-40',
        !isDragging && 'hover:bg-gray-50 dark:hover:bg-gray-800/40',
      )}
    >
      <button
        {...listeners}
        {...attributes}
        className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing flex-shrink-0"
        aria-label="Arrastar"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {isSubtotal ? (
        <span className="w-5 h-5 flex items-center justify-center text-purple-500 flex-shrink-0" aria-hidden>
          <Equal className="w-4 h-4" />
        </span>
      ) : (
        <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" aria-hidden />
      )}

      <span className="flex-1 text-[13px] font-semibold uppercase tracking-tight text-gray-900 dark:text-gray-100 truncate">
        {item.nome}
      </span>

      <span className={cn(
        'text-[10.5px] font-medium px-2.5 py-1 rounded-full flex-shrink-0',
        isSubtotal
          ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
      )}>
        {isSubtotal ? 'Subtotal' : 'Grupo'}
      </span>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {!isSubtotal && (
          <button
            onClick={onAddChild}
            title="Adicionar linha filha"
            className="w-7 h-7 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center justify-center"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={onEdit}
          title="Editar"
          className="w-7 h-7 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDelete}
          title="Excluir"
          className="w-7 h-7 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Plano de Contas (Mapeamentos) ────────────────────────────

interface PlanoContaRow {
  hierarquia: string
  nome:       string
  grid:       number
  natureza:   'Débito' | 'Crédito'
}

function PlanoContasPanel() {
  const [contas, setContas]   = useState<PlanoContaRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro]       = useState<string | null>(null)
  const [filtro, setFiltro]   = useState('')

  useEffect(() => {
    let cancelado = false
    fetch('/api/autosystem/plano-contas')
      .then(async r => {
        const json = await r.json()
        if (cancelado) return
        if (!r.ok || json.error) setErro(json.error ?? `Erro HTTP ${r.status}`)
        else setContas((json.contas ?? []) as PlanoContaRow[])
      })
      .catch(e => { if (!cancelado) setErro(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [])

  const filtrado = useMemo(() => {
    if (!contas) return []
    if (!filtro.trim()) return contas
    const q = filtro.trim().toLowerCase()
    return contas.filter(c =>
      c.hierarquia.toLowerCase().includes(q) ||
      c.nome.toLowerCase().includes(q) ||
      String(c.grid).includes(q)
    )
  }, [contas, filtro])

  return (
    <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
          <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100">Plano de Contas</h2>
          <p className="text-[11.5px] text-gray-400 dark:text-gray-500">
            {contas?.length ?? 0} conta{contas?.length === 1 ? '' : 's'} — base para mapeamento das linhas da máscara
          </p>
        </div>
        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar por código, nome ou grid"
            className="w-full pl-8 pr-3 h-9 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-[12.5px] focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : erro ? (
        <div className="flex items-start gap-2 mx-4 my-4 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-[13px]">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium">Erro ao carregar plano de contas</p>
            <p className="text-[12px] opacity-80 break-words">{erro}</p>
          </div>
        </div>
      ) : !filtrado.length ? (
        <p className="text-center py-12 text-[13px] text-gray-500 dark:text-gray-400">
          {filtro ? 'Nenhuma conta corresponde ao filtro' : 'Nenhuma conta encontrada'}
        </p>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto">
          {filtrado.map(c => {
            const depth = Math.max(0, c.hierarquia.split('.').filter(Boolean).length - 1)
            const isCredor = c.natureza === 'Crédito'
            return (
              <div
                key={c.grid}
                style={{ paddingLeft: 12 + depth * 20 }}
                className="flex items-center gap-3 h-10 pr-3 border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
              >
                <span className="text-[11.5px] font-mono text-gray-400 dark:text-gray-500 w-24 truncate flex-shrink-0">
                  {c.hierarquia}
                </span>
                <span className="flex-1 text-[12.5px] text-gray-900 dark:text-gray-100 truncate">
                  {c.nome}
                </span>
                <span className="text-[10.5px] font-mono text-gray-400 dark:text-gray-500 flex-shrink-0">
                  #{c.grid}
                </span>
                <span className={cn(
                  'text-[10.5px] font-medium px-2 py-0.5 rounded-full flex-shrink-0',
                  isCredor
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
                )}>
                  {c.natureza}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Editor ───────────────────────────────────────────────────

type AbaMascara = 'mascara' | 'mapeamentos'

interface Props {
  tipo: TipoMascara
  basePath: string
  tituloTipo: string
  mascaraId: string
}

export function MascaraEditor({ tipo, basePath, tituloTipo, mascaraId }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [mascara, setMascara] = useState<Mascara | null>(null)
  const [linhas, setLinhas]   = useState<MascaraLinha[]>([])
  const [loading, setLoading] = useState(true)
  const [aba, setAba]         = useState<AbaMascara>('mascara')

  // Drag state
  const [activeId, setActiveId]     = useState<string | null>(null)
  const [overId, setOverId]         = useState<string | null>(null)
  const [offsetLeft, setOffsetLeft] = useState(0)

  // Modal de linha
  const [showLinhaModal, setShowLinhaModal] = useState(false)
  const [editingLinha, setEditingLinha]     = useState<MascaraLinha | null>(null)
  const [parentForNew, setParentForNew]     = useState<string | null>(null)
  const [linhaNome, setLinhaNome]           = useState('')
  const [linhaTipoCampo, setLinhaTipoCampo] = useState<TipoLinhaMascara>('grupo')
  const [savingLinha, setSavingLinha]       = useState(false)

  // Excluir linha
  const [excluindoLinha, setExcluindoLinha] = useState<MascaraLinha | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const flat = useMemo(() => flattenTree(linhas), [linhas])
  const visibleFlat = useMemo(() => {
    if (!activeId) return flat
    const descendants = new Set(getDescendantIds(flat, activeId))
    return flat.filter(i => !descendants.has(i.id))
  }, [flat, activeId])

  const projection = useMemo(() => {
    if (!activeId || !overId) return null
    return projectDrop(visibleFlat, activeId, overId, offsetLeft)
  }, [activeId, overId, offsetLeft, visibleFlat])

  // ── Carga ───────────────────────────────────────────────
  async function carregar() {
    setLoading(true)
    const [mResp, lResp] = await Promise.all([
      supabase.from('mascaras').select('*').eq('id', mascaraId).eq('tipo', tipo).maybeSingle(),
      supabase.from('mascaras_linhas').select('*').eq('mascara_id', mascaraId),
    ])

    if (mResp.error || !mResp.data) {
      toast({ variant: 'destructive', title: 'Máscara não encontrada' })
      router.push(basePath)
      return
    }
    setMascara(mResp.data as Mascara)
    setLinhas((lResp.data ?? []) as MascaraLinha[])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [mascaraId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Drag handlers ───────────────────────────────────────
  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
    setOverId(String(e.active.id))
    setOffsetLeft(0)
  }

  function handleDragMove(e: DragMoveEvent) {
    setOffsetLeft(e.delta.x)
    if (e.over) setOverId(String(e.over.id))
  }

  async function handleDragEnd(e: DragEndEvent) {
    const active = String(e.active.id)
    const over   = e.over ? String(e.over.id) : null
    const dx     = e.delta.x

    setActiveId(null)
    setOverId(null)
    setOffsetLeft(0)

    if (!over) return
    const proj = projectDrop(visibleFlat, active, over, dx)
    if (!proj) return

    const oldIndex = visibleFlat.findIndex(i => i.id === active)
    const newIndex = visibleFlat.findIndex(i => i.id === over)
    if (oldIndex === -1 || newIndex === -1) return

    // Sequência visível pós-movimento
    const moved = arrayMove(visibleFlat, oldIndex, newIndex)

    // Determina parent_id de cada item visível pós-movimento.
    // Se for o item ativo → usa proj.parentId.
    // Senão → mantém parent_id atual.
    const visibleParents = new Map<string, string | null>()
    moved.forEach(i => {
      if (i.id === active) visibleParents.set(i.id, proj.parentId)
      else visibleParents.set(i.id, i.parent_id)
    })

    // Reconstrói o set completo: descendentes do ativo viajam junto.
    // Vamos calcular novas ordens em cada grupo (parent).
    const linhasCopy: MascaraLinha[] = linhas.map(l => ({ ...l }))
    const linhaById  = new Map(linhasCopy.map(l => [l.id, l]))

    // Atualiza parent_id do item ativo
    const lin = linhaById.get(active)
    if (!lin) return
    lin.parent_id = proj.parentId

    // Reordena visíveis dentro de cada parent baseado na ordem em `moved`
    const counters = new Map<string, number>()
    moved.forEach(i => {
      const pid = visibleParents.get(i.id) ?? null
      const key = pid ?? '__root'
      const ordem = counters.get(key) ?? 0
      counters.set(key, ordem + 1)
      const target = linhaById.get(i.id)
      if (target) target.ordem = ordem
    })

    // Descendentes do item ativo: mantêm ordens internas (já estão em linhasCopy),
    // mas seu parent_id permanece o mesmo (relativo). Nada a fazer aqui.

    const novasLinhas = Array.from(linhaById.values())
    setLinhas(novasLinhas) // optimistic

    // Persistir no banco — só atualiza linhas que mudaram parent_id ou ordem
    const dirty = novasLinhas.filter(n => {
      const old = linhas.find(o => o.id === n.id)
      return !old || old.parent_id !== n.parent_id || old.ordem !== n.ordem
    })

    for (const u of dirty) {
      const { error } = await supabase
        .from('mascaras_linhas')
        .update({ parent_id: u.parent_id, ordem: u.ordem, atualizado_em: new Date().toISOString() })
        .eq('id', u.id)
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao reordenar', description: error.message })
        carregar()
        return
      }
    }
  }

  // ── Modal: abrir/fechar ──────────────────────────────────
  function abrirNovaLinha(parentId: string | null) {
    setEditingLinha(null)
    setParentForNew(parentId)
    setLinhaNome('')
    setLinhaTipoCampo('grupo')
    setShowLinhaModal(true)
  }

  function abrirEdicao(l: MascaraLinha) {
    setEditingLinha(l)
    setParentForNew(null)
    setLinhaNome(l.nome)
    setLinhaTipoCampo(l.tipo_linha)
    setShowLinhaModal(true)
  }

  async function handleSalvarLinha(e: React.FormEvent) {
    e.preventDefault()
    if (!linhaNome.trim()) {
      toast({ variant: 'destructive', title: 'Informe o nome da linha' })
      return
    }
    setSavingLinha(true)

    if (editingLinha) {
      const { error } = await supabase
        .from('mascaras_linhas')
        .update({
          nome: linhaNome.trim(),
          tipo_linha: linhaTipoCampo,
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', editingLinha.id)
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao atualizar', description: error.message })
        setSavingLinha(false); return
      }
    } else {
      // Próxima ordem dentro do parent
      const irmaos = linhas.filter(l => l.parent_id === parentForNew)
      const proximaOrdem = irmaos.length === 0 ? 0 : Math.max(...irmaos.map(l => l.ordem)) + 1

      const { error } = await supabase
        .from('mascaras_linhas')
        .insert({
          mascara_id: mascaraId,
          parent_id: parentForNew,
          ordem: proximaOrdem,
          nome: linhaNome.trim(),
          tipo_linha: linhaTipoCampo,
        })
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao criar linha', description: error.message })
        setSavingLinha(false); return
      }
    }

    setShowLinhaModal(false)
    setSavingLinha(false)
    carregar()
  }

  async function handleExcluirLinha(l: MascaraLinha) {
    setExcluindoLinha(null)
    const { error } = await supabase.from('mascaras_linhas').delete().eq('id', l.id)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: error.message })
      return
    }
    toast({ title: 'Linha excluída' })
    carregar()
  }

  // ── Render ──────────────────────────────────────────────
  if (loading || !mascara) {
    return (
      <>
        <Header title={`Máscaras ${tituloTipo}`} description={`Configure a estrutura das máscaras de ${tituloTipo}`} />
        <div className="flex justify-center py-16 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      </>
    )
  }

  const totalLinhas = linhas.length

  return (
    <>
      <Header
        title={`Máscaras ${tituloTipo}`}
        description={`Configure a estrutura das máscaras de ${tituloTipo}`}
      />

      <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
        {/* Card de cabeçalho com nome da máscara + voltar */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
          <button
            onClick={() => router.push(basePath)}
            title="Voltar"
            className="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-gray-900 dark:text-gray-100 truncate">{mascara.nome}</p>
            <p className="text-[11.5px] text-gray-400 dark:text-gray-500">
              {totalLinhas} linha{totalLinhas === 1 ? '' : 's'}
              {mascara.descricao && ` • ${mascara.descricao}`}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
          {([
            { key: 'mascara',     label: 'Máscara' },
            { key: 'mapeamentos', label: 'Mapeamentos' },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setAba(t.key)}
              className={cn(
                'px-4 py-2.5 text-[12.5px] font-semibold border-b-2 -mb-px transition-colors',
                aba === t.key
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {aba === 'mapeamentos' ? (
          <PlanoContasPanel />
        ) : (
        /* Card da estrutura */
        <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <Layers className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="flex-1 text-[14px] font-semibold text-gray-900 dark:text-gray-100">
              Estrutura {tituloTipo === 'DRE' ? 'da DRE' : 'do Fluxo de Caixa'}
            </h2>
            <button
              onClick={() => abrirNovaLinha(null)}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-[12.5px] font-semibold hover:bg-black dark:hover:bg-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar Linha
            </button>
          </div>

          {flat.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Layers className="w-7 h-7 text-gray-300 dark:text-gray-700" />
              <p className="text-[13px] text-gray-500 dark:text-gray-400">Nenhuma linha cadastrada</p>
              <button
                onClick={() => abrirNovaLinha(null)}
                className="text-[12px] font-medium text-blue-600 hover:text-blue-700"
              >
                + Adicionar primeira linha
              </button>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragOver={(e) => e.over && setOverId(String(e.over.id))}
              onDragEnd={handleDragEnd}
              onDragCancel={() => { setActiveId(null); setOverId(null); setOffsetLeft(0) }}
            >
              <SortableContext items={visibleFlat.map(i => i.id)} strategy={verticalListSortingStrategy}>
                {visibleFlat.map(item => (
                  <SortableRow
                    key={item.id}
                    item={item}
                    projectedDepth={item.id === activeId && projection ? projection.depth : null}
                    onEdit={() => abrirEdicao(item)}
                    onDelete={() => setExcluindoLinha(item)}
                    onAddChild={() => abrirNovaLinha(item.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
        )}
      </div>

      {/* Modal Linha */}
      {showLinhaModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-[15px]">
                {editingLinha ? 'Editar Linha' : parentForNew ? 'Nova Linha (filha)' : 'Nova Linha'}
              </h3>
              <button onClick={() => setShowLinhaModal(false)} className="ml-auto text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSalvarLinha} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nome <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={linhaNome}
                  onChange={(e) => setLinhaNome(e.target.value)}
                  required
                  autoFocus
                  placeholder="Ex: RECEITA OPERACIONAL BRUTA"
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['grupo', 'subtotal'] as TipoLinhaMascara[]).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setLinhaTipoCampo(t)}
                      className={cn(
                        'flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-[12.5px] font-medium transition-colors',
                        linhaTipoCampo === t
                          ? t === 'subtotal'
                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                            : 'border-gray-900 dark:border-gray-100 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800',
                      )}
                    >
                      {t === 'subtotal' && <Equal className="w-3.5 h-3.5" />}
                      {t === 'grupo' ? 'Grupo' : 'Subtotal'}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">
                  {linhaTipoCampo === 'grupo'
                    ? 'Grupos contêm sub-grupos ou contas que serão mapeadas depois.'
                    : 'Subtotais somam grupos anteriores (ex: RECEITA OPERACIONAL LÍQUIDA).'}
                </p>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowLinhaModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-[13px] font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingLinha}
                  className="flex-1 px-4 py-2.5 bg-gray-900 dark:bg-gray-100 hover:bg-black dark:hover:bg-white disabled:opacity-50 text-white dark:text-gray-900 rounded-lg text-[13px] font-semibold"
                >
                  {savingLinha ? 'Salvando…' : editingLinha ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmação de exclusão de linha */}
      {excluindoLinha && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-[15px] mb-2">Excluir linha?</h3>
            <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-5">
              <strong className="text-gray-700 dark:text-gray-200">{excluindoLinha.nome}</strong> e todas as suas linhas filhas serão excluídas.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setExcluindoLinha(null)}
                className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-[13px] font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleExcluirLinha(excluindoLinha)}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[13px] font-semibold"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
