'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils/cn'
import {
  ArrowLeft, Plus, Loader2, FolderTree, ChevronDown, ChevronRight,
  Target, Pencil, Trash2, Building2, Users as UsersIcon, Copy,
  DollarSign, Hash, Percent, Layers, AlertCircle, Save, Filter,
  CalendarRange, FolderPlus, ClipboardList,
} from 'lucide-react'
import { ProdutoMultiSelect } from '../_components/ProdutoMultiSelect'
import { PostoCombobox } from '../_components/PostoCombobox'
import type { MetaGrupo } from '@/app/api/comissionamento/metas/grupos/route'
import type { Meta, MetaCampo, MetaFiltro, MetaModo, MetaFiltroRegra } from '@/app/api/comissionamento/metas/route'
import type { ComissioMembro } from '@/app/api/comissionamento/membros/route'

// ── Tipos locais ────────────────────────────────────────────────────────────

interface Posto {
  id:   string
  nome: string
}

interface SplitRow {
  id:           string
  meta_id:      string
  membro_id:    string
  membro_nome:  string
  membro_role:  string | null
  valor_meta:   number
}

interface ProdutoTipoOpt { value: string; label: string }
const PRODUTO_TIPOS: ProdutoTipoOpt[] = [
  { value: 'C', label: 'Combustível' },
  { value: 'M', label: 'Mercadoria / Loja' },
  { value: 'K', label: 'Kit' },
  { value: 'S', label: 'Serviço' },
  { value: 'P', label: 'Outro (P)' },
]

interface AsItem    { grid: number; codigo: number; nome: string; grupo?: number }

// ── Constantes de UI ────────────────────────────────────────────────────────

const CAMPO_LABEL: Record<MetaCampo, string> = {
  faturamento: 'Faturamento',
  quantidade:  'Quantidade',
  margem:      'Margem',
  mix:         'Mix',
  markup:      'Markup',
  checklist:   'Checklist',
}
const CAMPO_ICONE: Record<MetaCampo, React.ElementType> = {
  faturamento: DollarSign,
  quantidade:  Hash,
  margem:      Percent,
  mix:         Layers,
  markup:      Percent,
  checklist:   ClipboardList,
}
const CAMPO_CORES: Record<MetaCampo, string> = {
  faturamento: 'bg-orange-100 text-orange-700 border-orange-200',
  quantidade:  'bg-blue-100 text-blue-700 border-blue-200',
  margem:      'bg-emerald-100 text-emerald-700 border-emerald-200',
  mix:         'bg-purple-100 text-purple-700 border-purple-200',
  markup:      'bg-amber-100 text-amber-700 border-amber-200',
  checklist:   'bg-slate-100 text-slate-700 border-slate-200',
}

const FILTRO_LABEL: Record<MetaFiltro, string> = {
  produto:           'Produto',
  grupo_produto:     'Grupo de Produto',
  subgrupo_produto:  'Subgrupo de Produto',
  produto_tipo:      'Tipo de Produto',
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const fmtNum = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const fmtData = (s: string | null | undefined) => {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

function valorPorCampo(v: number, campo: MetaCampo): string {
  if (campo === 'faturamento') return fmtBRL(v)
  if (campo === 'margem' || campo === 'markup') return `${fmtNum(v)}%`
  if (campo === 'quantidade')  return `${fmtNum(v)} un.`
  return fmtNum(v)
}

// Constrói a árvore: cada grupo recebe seus filhos
interface GrupoNode extends MetaGrupo {
  filhos: GrupoNode[]
}
function buildTree(grupos: MetaGrupo[]): GrupoNode[] {
  const byParent = new Map<string | null, GrupoNode[]>()
  for (const g of grupos) {
    const lista = byParent.get(g.parent_id) ?? []
    lista.push({ ...g, filhos: [] })
    byParent.set(g.parent_id, lista)
  }
  function attach(nodes: GrupoNode[]): GrupoNode[] {
    for (const n of nodes) n.filhos = attach(byParent.get(n.id) ?? [])
    return nodes.sort((a, b) => (a.sort_order - b.sort_order) || a.nome.localeCompare(b.nome))
  }
  return attach(byParent.get(null) ?? [])
}

// ── Página ──────────────────────────────────────────────────────────────────

export default function ComissionamentoMetasPage() {
  // Postos + posto selecionado
  const [postos,    setPostos]    = useState<Posto[]>([])
  const [postoId,   setPostoId]   = useState<string>('')

  // Domínio principal
  const [grupos,  setGrupos]  = useState<MetaGrupo[]>([])
  const [metas,   setMetas]   = useState<Meta[]>([])
  const [membros, setMembros] = useState<ComissioMembro[]>([])
  const [loading, setLoading] = useState(false)
  const [erro,    setErro]    = useState<string | null>(null)

  // Filtros: grupo selecionado na árvore (null = todos)
  const [grupoSelId, setGrupoSelId] = useState<string | null>(null)
  const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(new Set())

  // Cache pra splits por meta (lazy)
  const [splitsPorMeta, setSplitsPorMeta] = useState<Map<string, SplitRow[]>>(new Map())

  // Listas AS p/ filtro de meta
  const [gruposAS, setGruposAS] = useState<AsItem[]>([])
  const [subgruposAS, setSubgruposAS] = useState<AsItem[]>([])

  // Diálogos
  const [grupoDialog,  setGrupoDialog]  = useState<{ open: boolean; edit: MetaGrupo | null }>({ open: false, edit: null })
  const [metaDialog,   setMetaDialog]   = useState<{ open: boolean; edit: Meta | null }>({ open: false, edit: null })
  const [splitsDialog, setSplitsDialog] = useState<{ open: boolean; meta: Meta | null }>({ open: false, meta: null })
  const [excluindoGrupo, setExcluindoGrupo] = useState<MetaGrupo | null>(null)
  const [excluindoMeta,  setExcluindoMeta]  = useState<Meta | null>(null)

  // ── Carrega postos uma vez ───────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/postos')
      .then(r => r.json())
      .then(json => {
        const lista = ((json.postos ?? []) as Posto[]).slice().sort((a, b) => a.nome.localeCompare(b.nome))
        setPostos(lista)
        if (lista.length > 0 && !postoId) setPostoId(lista[0].id)
      })
      .catch(() => toast({ variant: 'destructive', title: 'Erro ao carregar postos' }))
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Carrega grupos/metas/membros quando muda o posto ─────────────────────
  const carregar = useCallback(async () => {
    if (!postoId) return
    setLoading(true)
    setErro(null)
    try {
      const [gResp, mResp, memResp] = await Promise.all([
        fetch(`/api/comissionamento/metas/grupos?posto_id=${postoId}`).then(r => r.json()),
        fetch(`/api/comissionamento/metas?posto_id=${postoId}`).then(r => r.json()),
        fetch(`/api/comissionamento/membros?posto_id=${postoId}`).then(r => r.json()),
      ])
      if (gResp.error) throw new Error(gResp.error)
      if (mResp.error) throw new Error(mResp.error)
      if (memResp.error) throw new Error(memResp.error)
      setGrupos(gResp.grupos ?? [])
      setMetas(mResp.metas ?? [])
      setMembros(memResp.membros ?? [])
      setSplitsPorMeta(new Map())
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [postoId])
  useEffect(() => { carregar() }, [carregar])

  // Carrega lookup do AUTOSYSTEM uma vez (independente do posto)
  useEffect(() => {
    fetch('/api/comissionamento/grupos-as')
      .then(r => r.json())
      .then(json => {
        setGruposAS(json.grupos ?? [])
        setSubgruposAS(json.subgrupos ?? [])
      })
      .catch(() => {})
  }, [])

  // Carrega splits sob demanda
  const carregarSplits = useCallback(async (metaId: string) => {
    const cached = splitsPorMeta.get(metaId)
    if (cached) return cached
    const json = await fetch(`/api/comissionamento/metas/${metaId}`).then(r => r.json())
    const splits = (json.splits ?? []) as SplitRow[]
    setSplitsPorMeta(prev => {
      const next = new Map(prev)
      next.set(metaId, splits)
      return next
    })
    return splits
  }, [splitsPorMeta])

  // ── Árvore + filtragem ───────────────────────────────────────────────────
  const tree = useMemo(() => buildTree(grupos), [grupos])
  const grupoSel = grupoSelId ? grupos.find(g => g.id === grupoSelId) ?? null : null

  const metasVisiveis = useMemo(() => {
    if (!grupoSelId) return metas
    return metas.filter(m => m.grupo_id === grupoSelId)
  }, [metas, grupoSelId])

  function toggleGrupo(id: string) {
    setGruposAbertos(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function expandirTodos() {
    setGruposAbertos(new Set(grupos.map(g => g.id)))
  }

  // ── Duplicar grupo ───────────────────────────────────────────────────────
  // Abre o modal de duplicação. Antes disparava direto — agora o modal
  // pergunta nome e destino (só este posto ou toda a rede do esquema).
  const [duplicarDialog, setDuplicarDialog] = useState<MetaGrupo | null>(null)

  // ── Confirmações de exclusão ─────────────────────────────────────────────
  async function confirmarExcluirGrupo() {
    if (!excluindoGrupo) return
    const r = await fetch(`/api/comissionamento/metas/grupos/${excluindoGrupo.id}`, { method: 'DELETE' })
    const json = await r.json().catch(() => ({}))
    if (!r.ok || json.error) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: json.error })
      return
    }
    const metasExc = Number(json.metas_excluidas ?? 0)
    toast({
      title: 'Grupo excluído',
      description: metasExc > 0 ? `${metasExc} meta${metasExc === 1 ? '' : 's'} também foi${metasExc === 1 ? '' : 'ram'} excluída${metasExc === 1 ? '' : 's'}.` : undefined,
    })
    if (grupoSelId === excluindoGrupo.id) setGrupoSelId(null)
    setExcluindoGrupo(null)
    await carregar()
  }

  async function confirmarExcluirMeta() {
    if (!excluindoMeta) return
    const r = await fetch(`/api/comissionamento/metas/${excluindoMeta.id}`, { method: 'DELETE' })
    const json = await r.json().catch(() => ({}))
    if (!r.ok || json.error) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: json.error })
      return
    }
    toast({ title: 'Meta excluída' })
    setExcluindoMeta(null)
    await carregar()
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-full">
      <Header
        title="Metas"
        description="Defina metas de venda e distribua entre vendedores"
        actions={
          <Link
            href="/comissionamento"
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-[12.5px]"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Comissionamento
          </Link>
        }
      />

      {/* Toolbar — seleção de posto + ações */}
      <div className="flex flex-wrap items-center gap-3 px-4 md:px-6 py-2.5 min-h-[52px] bg-white/95 dark:bg-gray-900/95 border-b border-gray-200/80 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-gray-400" />
          <PostoCombobox
            postos={postos}
            value={postoId}
            onChange={setPostoId}
            placeholder="Selecione um posto"
            className="min-w-[280px]"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            disabled={!postoId}
            onClick={() => setGrupoDialog({ open: true, edit: null })}
            className="gap-1.5 text-[12.5px]"
          >
            <FolderPlus className="w-3.5 h-3.5" /> Novo grupo
          </Button>
          <Button
            disabled={!postoId}
            onClick={() => setMetaDialog({ open: true, edit: null })}
            className="gap-1.5 bg-gray-900 hover:bg-black text-white text-[12.5px]"
          >
            <Plus className="w-3.5 h-3.5" /> Nova meta
          </Button>
        </div>
      </div>

      {erro && (
        <div className="mx-4 md:mx-6 mt-3 flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px]">
          <AlertCircle className="w-4 h-4 mt-0.5" />
          <p>{erro}</p>
        </div>
      )}

      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-0">
        {/* ── Coluna esquerda: árvore de grupos ── */}
        <aside className="border-r border-gray-200 overflow-y-auto bg-gray-50/30">
          <div className="px-4 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <FolderTree className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-[11.5px] font-semibold text-gray-700 uppercase tracking-wide">Grupos</span>
            </div>
            <button
              onClick={expandirTodos}
              className="text-[11px] text-orange-600 hover:text-orange-700 font-medium"
              disabled={grupos.length === 0}
            >
              Expandir tudo
            </button>
          </div>

          <div className="px-2 py-2 space-y-0.5">
            {/* Item "Todas" */}
            <button
              onClick={() => setGrupoSelId(null)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[12.5px] transition-colors',
                !grupoSelId ? 'bg-orange-100 text-orange-800 font-semibold' : 'hover:bg-gray-100 text-gray-700',
              )}
            >
              <Target className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="flex-1 truncate">Todas as metas</span>
              <span className="text-[10.5px] text-gray-500">{metas.length}</span>
            </button>

            <TreeRender
              nodes={tree}
              level={0}
              abertos={gruposAbertos}
              onToggle={toggleGrupo}
              selectedId={grupoSelId}
              onSelect={setGrupoSelId}
              onEdit={(g) => setGrupoDialog({ open: true, edit: g })}
              onDuplicate={(g) => setDuplicarDialog(g)}
              onDelete={(g) => setExcluindoGrupo(g)}
              metas={metas}
              onCreateChild={(parentId) => setGrupoDialog({ open: true, edit: { id:'', posto_id: postoId, parent_id: parentId, nome:'', period_start:null, period_end:null, sort_order:0, criado_em:'', atualizado_em:'' } as MetaGrupo })}
            />

            {!loading && grupos.length === 0 && (
              <p className="px-2 py-6 text-[11.5px] text-gray-400 italic text-center">
                Nenhum grupo criado<br />— crie grupos pra organizar suas metas
              </p>
            )}
          </div>
        </aside>

        {/* ── Coluna direita: lista de metas ── */}
        <main className="overflow-y-auto p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[13px] font-bold text-gray-900">
                {grupoSel ? grupoSel.nome : 'Todas as metas'}
              </p>
              <p className="text-[11.5px] text-gray-500 mt-0.5">
                {metasVisiveis.length} meta{metasVisiveis.length === 1 ? '' : 's'}
                {grupoSel?.period_start && ` · ${fmtData(grupoSel.period_start)} a ${fmtData(grupoSel.period_end)}`}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-[13px]">Carregando metas…</span>
            </div>
          ) : metasVisiveis.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <Target className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-[13px] font-medium text-gray-700">Nenhuma meta {grupoSel ? 'neste grupo' : 'cadastrada'}</p>
              <p className="text-[12px] text-gray-500 mt-1 mb-4">Crie metas para acompanhar a performance dos vendedores.</p>
              <Button
                disabled={!postoId}
                onClick={() => setMetaDialog({ open: true, edit: null })}
                className="gap-1.5 bg-gray-900 hover:bg-black text-white text-[12.5px]"
              >
                <Plus className="w-3.5 h-3.5" /> Nova meta
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {metasVisiveis.map(m => (
                <MetaCard
                  key={m.id}
                  meta={m}
                  splits={splitsPorMeta.get(m.id) ?? null}
                  onLoadSplits={() => carregarSplits(m.id)}
                  onEdit={() => setMetaDialog({ open: true, edit: m })}
                  onSplits={() => setSplitsDialog({ open: true, meta: m })}
                  onDelete={() => setExcluindoMeta(m)}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* ── Diálogos ── */}
      {grupoDialog.open && (
        <DialogGrupo
          aberto={grupoDialog.open}
          editar={grupoDialog.edit}
          postoId={postoId}
          grupos={grupos}
          onClose={() => setGrupoDialog({ open: false, edit: null })}
          onSalvo={async () => {
            setGrupoDialog({ open: false, edit: null })
            await carregar()
          }}
        />
      )}

      {metaDialog.open && (
        <DialogMeta
          aberto={metaDialog.open}
          editar={metaDialog.edit}
          postoId={postoId}
          grupos={grupos}
          grupoSelId={grupoSelId}
          gruposAS={gruposAS}
          subgruposAS={subgruposAS}
          onClose={() => setMetaDialog({ open: false, edit: null })}
          onSalvo={async () => {
            setMetaDialog({ open: false, edit: null })
            await carregar()
          }}
        />
      )}

      {splitsDialog.open && splitsDialog.meta && (
        <DialogSplits
          aberto={splitsDialog.open}
          meta={splitsDialog.meta}
          membros={membros}
          splitsIniciais={splitsPorMeta.get(splitsDialog.meta.id) ?? null}
          onClose={() => setSplitsDialog({ open: false, meta: null })}
          onSalvo={async () => {
            const metaId = splitsDialog.meta!.id
            setSplitsDialog({ open: false, meta: null })
            // Invalida o cache e re-busca para o card refletir o novo total
            setSplitsPorMeta(prev => {
              const next = new Map(prev)
              next.delete(metaId)
              return next
            })
          }}
        />
      )}

      {/* Duplicar grupo — modal com escolha (só posto ou rede) */}
      {duplicarDialog && (
        <DialogDuplicarGrupo
          grupo={duplicarDialog}
          onClose={() => setDuplicarDialog(null)}
          onFeito={async (novoGrupoId) => {
            setDuplicarDialog(null)
            await carregar()
            if (novoGrupoId) setGrupoSelId(novoGrupoId)
          }}
        />
      )}

      {/* Confirmar exclusão de grupo */}
      <Dialog open={!!excluindoGrupo} onOpenChange={(o) => !o && setExcluindoGrupo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="w-4 h-4" /> Excluir grupo
            </DialogTitle>
          </DialogHeader>
          {excluindoGrupo && (() => {
            // Conta metas do próprio grupo E dos subgrupos descendentes.
            // Mesmo CASCADE do banco, mas a UI antecipa pro usuário decidir.
            const descendentes = new Set<string>([excluindoGrupo.id])
            let mudou = true
            while (mudou) {
              mudou = false
              for (const g of grupos) {
                if (g.parent_id && descendentes.has(g.parent_id) && !descendentes.has(g.id)) {
                  descendentes.add(g.id); mudou = true
                }
              }
            }
            const qtdMetas = metas.filter(m => m.grupo_id && descendentes.has(m.grupo_id)).length
            const qtdSubgrupos = descendentes.size - 1  // não conta o próprio
            return (
              <div className="text-[13.5px] text-gray-700 py-2 space-y-2">
                <p>
                  Excluir o grupo <strong>{excluindoGrupo.nome}</strong>?
                </p>
                <div className="rounded-md border border-red-200 bg-red-50/70 px-3 py-2 text-[12.5px] text-red-900 space-y-0.5">
                  <p>
                    Serão excluídos <b>em cascata</b>:
                  </p>
                  <ul className="list-disc pl-5">
                    {qtdSubgrupos > 0 && <li>{qtdSubgrupos} sub-grupo{qtdSubgrupos === 1 ? '' : 's'}</li>}
                    <li>
                      <b>{qtdMetas}</b> meta{qtdMetas === 1 ? '' : 's'} {qtdMetas === 0 && '(nenhuma no grupo)'}
                    </li>
                    {qtdMetas > 0 && <li className="text-red-800">Distribuições (splits) dessas metas</li>}
                  </ul>
                </div>
                <p className="text-[11.5px] text-gray-500">Ação irreversível.</p>
              </div>
            )
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluindoGrupo(null)}>Cancelar</Button>
            <Button onClick={confirmarExcluirGrupo} className="bg-red-600 hover:bg-red-700 text-white gap-2">
              <Trash2 className="w-3.5 h-3.5" /> Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar exclusão de meta */}
      <Dialog open={!!excluindoMeta} onOpenChange={(o) => !o && setExcluindoMeta(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="w-4 h-4" /> Excluir meta
            </DialogTitle>
          </DialogHeader>
          {excluindoMeta && (
            <p className="text-[13.5px] text-gray-700 py-2">
              Excluir a meta <strong>{excluindoMeta.nome}</strong>? Todos os splits (distribuição entre vendedores) também serão removidos. Esta ação é permanente.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluindoMeta(null)}>Cancelar</Button>
            <Button onClick={confirmarExcluirMeta} className="bg-red-600 hover:bg-red-700 text-white gap-2">
              <Trash2 className="w-3.5 h-3.5" /> Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── TreeView recursiva de grupos ────────────────────────────────────────────

interface TreeRenderProps {
  nodes:     GrupoNode[]
  level:     number
  abertos:   Set<string>
  onToggle:  (id: string) => void
  selectedId: string | null
  onSelect:  (id: string | null) => void
  onEdit:    (g: MetaGrupo) => void
  onDelete:  (g: MetaGrupo) => void
  onDuplicate: (g: MetaGrupo) => void
  onCreateChild: (parentId: string) => void
  metas:     Meta[]
}
function TreeRender(props: TreeRenderProps) {
  return (
    <>
      {props.nodes.map(n => {
        const aberto = props.abertos.has(n.id)
        const selecionado = props.selectedId === n.id
        const qtdMetas = props.metas.filter(m => m.grupo_id === n.id).length
        return (
          <div key={n.id}>
            <div
              className={cn(
                'group flex items-center gap-1.5 pr-1 rounded-md text-[12.5px] transition-colors',
                selecionado ? 'bg-orange-100 text-orange-800 font-semibold' : 'hover:bg-gray-100 text-gray-700',
              )}
              style={{ paddingLeft: 8 + props.level * 12 }}
            >
              {n.filhos.length > 0 ? (
                <button
                  onClick={(e) => { e.stopPropagation(); props.onToggle(n.id) }}
                  className="p-0.5 rounded hover:bg-gray-200 text-gray-500"
                >
                  {aberto ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
              ) : (
                <span className="w-4" />
              )}
              <button
                onClick={() => props.onSelect(n.id)}
                className="flex-1 flex items-center gap-1.5 py-1.5 text-left min-w-0"
              >
                <FolderTree className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="truncate">{n.nome}</span>
                <span className="text-[10.5px] text-gray-400 font-normal">{qtdMetas}</span>
              </button>
              <div className="opacity-0 group-hover:opacity-100 flex items-center transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); props.onCreateChild(n.id) }}
                  title="Sub-grupo"
                  className="p-1 rounded text-gray-500 hover:text-orange-600 hover:bg-orange-50"
                >
                  <Plus className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); props.onEdit(n) }}
                  title="Editar"
                  className="p-1 rounded text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); props.onDuplicate(n) }}
                  title="Duplicar grupo (copia metas sem valor nem distribuição)"
                  className="p-1 rounded text-gray-500 hover:text-emerald-600 hover:bg-emerald-50"
                >
                  <Copy className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); props.onDelete(n) }}
                  title="Excluir"
                  className="p-1 rounded text-gray-500 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
            {aberto && n.filhos.length > 0 && (
              <TreeRender {...props} nodes={n.filhos} level={props.level + 1} />
            )}
          </div>
        )
      })}
    </>
  )
}

// ── Card de meta ────────────────────────────────────────────────────────────

interface MetaCardProps {
  meta:         Meta
  splits:       SplitRow[] | null
  onLoadSplits: () => Promise<SplitRow[]>
  onEdit:       () => void
  onSplits:     () => void
  onDelete:     () => void
}
function MetaCard({ meta, splits, onLoadSplits, onEdit, onSplits, onDelete }: MetaCardProps) {
  const [carregouSplits, setCarregouSplits] = useState(splits !== null)
  useEffect(() => {
    if (splits === null && !carregouSplits) {
      onLoadSplits().then(() => setCarregouSplits(true)).catch(() => setCarregouSplits(true))
    }
  }, [splits, carregouSplits, onLoadSplits])

  const totalAlocado = (splits ?? []).reduce((s, x) => s + x.valor_meta, 0)
  const pctAlocado = meta.valor_meta > 0 ? (totalAlocado / meta.valor_meta) * 100 : 0
  const corPct = pctAlocado >= 100 ? 'bg-emerald-500'
               : pctAlocado >= 70  ? 'bg-amber-500'
               : 'bg-gray-300'

  const Icone = CAMPO_ICONE[meta.campo]
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors group">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-gray-900 truncate">{meta.nome}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn('inline-flex items-center gap-1 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full border', CAMPO_CORES[meta.campo])}>
              <Icone className="w-2.5 h-2.5" />
              {CAMPO_LABEL[meta.campo]}
            </span>
            {(() => {
              const fs: MetaFiltroRegra[] = Array.isArray((meta as any).filtros) && (meta as any).filtros.length > 0
                ? (meta as any).filtros
                : (meta.filtro_tipo && meta.filtro_valores && meta.filtro_valores.length > 0
                    ? [{ tipo: meta.filtro_tipo as MetaFiltro, valores: meta.filtro_valores, modo: meta.filtro_modo ?? 'incluir' }]
                    : [])
              if (fs.length === 0) return null
              const totalValores = fs.reduce((s, f) => s + f.valores.length, 0)
              const titleText = fs.map(f =>
                `${f.modo === 'incluir' ? 'só' : 'exceto'} ${FILTRO_LABEL[f.tipo]}: ${f.valores.join(', ')}`
              ).join(' E ')
              return (
                <span
                  className="inline-flex items-center gap-1 text-[10.5px] text-gray-600 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded-full"
                  title={titleText}
                >
                  <Filter className="w-2.5 h-2.5" />
                  {fs.length === 1
                    ? `${fs[0].modo === 'incluir' ? 'só' : 'exceto'} ${fs[0].valores.length}`
                    : `${fs.length} filtros · ${totalValores} valor${totalValores === 1 ? '' : 'es'}`}
                </span>
              )
            })()}
          </div>
        </div>
        <div className="opacity-0 group-hover:opacity-100 flex items-center transition-opacity">
          <button onClick={onEdit} title="Editar" className="p-1.5 rounded-md text-gray-500 hover:text-blue-600 hover:bg-blue-50">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} title="Excluir" className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <p className="text-[18px] font-bold tabular-nums text-gray-900 leading-tight">
        {valorPorCampo(meta.valor_meta, meta.campo)}
      </p>

      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-gray-500">
        <CalendarRange className="w-3 h-3" />
        {fmtData(meta.period_start)} a {fmtData(meta.period_end)}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100">
        <button onClick={onSplits} className="w-full flex items-center justify-between text-[11.5px] text-gray-700 hover:text-gray-900">
          <span className="flex items-center gap-1.5">
            <UsersIcon className="w-3 h-3 text-gray-400" />
            <span className="font-medium">{(splits ?? []).length} vendedor{(splits ?? []).length === 1 ? '' : 'es'}</span>
          </span>
          <span className="text-[10.5px] text-gray-500">{pctAlocado.toFixed(0)}% alocado</span>
        </button>
        <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div className={cn('h-full transition-all', corPct)} style={{ width: `${Math.min(pctAlocado, 100)}%` }} />
        </div>
      </div>
    </div>
  )
}

// ── Diálogo: criar/editar grupo ─────────────────────────────────────────────

interface DialogGrupoProps {
  aberto:  boolean
  editar:  MetaGrupo | null
  postoId: string
  grupos:  MetaGrupo[]
  onClose: () => void
  onSalvo: () => void | Promise<void>
}
function DialogGrupo({ aberto, editar, postoId, grupos, onClose, onSalvo }: DialogGrupoProps) {
  const editandoExistente = !!editar && editar.id !== ''
  const [nome, setNome] = useState(editar?.nome ?? '')
  const [parentId, setParentId] = useState<string>(editar?.parent_id ?? '')
  const [periodIni, setPeriodIni] = useState(editar?.period_start ?? '')
  const [periodFim, setPeriodFim] = useState(editar?.period_end ?? '')
  const [salvando, setSalvando] = useState(false)

  // Opções de parent — exclui o próprio grupo e seus descendentes
  const opcoesParent = useMemo(() => {
    if (!editandoExistente) return grupos
    const proibidos = new Set<string>([editar!.id])
    let mudou = true
    while (mudou) {
      mudou = false
      for (const g of grupos) {
        if (g.parent_id && proibidos.has(g.parent_id) && !proibidos.has(g.id)) {
          proibidos.add(g.id); mudou = true
        }
      }
    }
    return grupos.filter(g => !proibidos.has(g.id))
  }, [editandoExistente, editar, grupos])

  async function salvar() {
    if (!nome.trim()) {
      toast({ variant: 'destructive', title: 'Nome obrigatório' })
      return
    }
    setSalvando(true)
    try {
      const payload = {
        posto_id:      postoId,
        parent_id:     parentId || null,
        nome:          nome.trim(),
        period_start:  periodIni || null,
        period_end:    periodFim || null,
      }
      const r = editandoExistente
        ? await fetch(`/api/comissionamento/metas/grupos/${editar!.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch('/api/comissionamento/metas/grupos', {
            method: 'POST',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
      const json = await r.json()
      if (!r.ok || json.error) {
        toast({ variant: 'destructive', title: 'Erro', description: json.error })
        return
      }
      toast({ title: editandoExistente ? 'Grupo atualizado' : 'Grupo criado' })
      await onSalvo()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-purple-500" />
            {editandoExistente ? 'Editar grupo' : 'Novo grupo'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Nome</Label>
            <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Combustíveis Q1" />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Grupo pai (opcional)</Label>
            <Select value={parentId || '__root__'} onValueChange={(v) => setParentId(v === '__root__' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__root__">— Raiz —</SelectItem>
                {opcoesParent.map(g => (
                  <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Início (opcional)</Label>
              <Input type="date" value={periodIni} onChange={e => setPeriodIni(e.target.value)} />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Fim (opcional)</Label>
              <Input type="date" value={periodFim} onChange={e => setPeriodFim(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando} className="gap-2 bg-gray-900 hover:bg-black text-white">
            {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {editandoExistente ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Diálogo: criar/editar meta ──────────────────────────────────────────────

interface DialogMetaProps {
  aberto:      boolean
  editar:      Meta | null
  postoId:     string
  grupos:      MetaGrupo[]
  grupoSelId:  string | null
  gruposAS:    AsItem[]
  subgruposAS: AsItem[]
  onClose:     () => void
  onSalvo:     () => void | Promise<void>
}
function DialogMeta(props: DialogMetaProps) {
  const editar = props.editar
  const [nome, setNome] = useState(editar?.nome ?? '')
  const [campo, setCampo] = useState<MetaCampo>(editar?.campo ?? 'faturamento')
  const [grupoId, setGrupoId] = useState<string>(editar?.grupo_id ?? props.grupoSelId ?? '')
  // Estado: lista de filtros (cada item = uma regra). Migra do formato legado
  // (filtro_tipo/filtro_valores/filtro_modo) quando a meta foi cadastrada
  // antes da migration 084.
  const [filtros, setFiltros] = useState<MetaFiltroRegra[]>(() => {
    const fromApi: any = (editar as any)?.filtros
    if (Array.isArray(fromApi) && fromApi.length > 0) {
      return fromApi
        .filter((f: any) => f && f.tipo && Array.isArray(f.valores))
        .map((f: any) => ({
          tipo: f.tipo as MetaFiltro,
          valores: (f.valores as unknown[]).map(v => String(v)),
          modo: (f.modo === 'excluir' ? 'excluir' : 'incluir') as MetaModo,
        }))
    }
    if (editar?.filtro_tipo && editar.filtro_valores && editar.filtro_valores.length > 0) {
      return [{
        tipo: editar.filtro_tipo as MetaFiltro,
        valores: editar.filtro_valores,
        modo: editar.filtro_modo ?? 'incluir',
      }]
    }
    return []
  })
  // Mix: agora baseado em CATEGORIAS de produto (cadastradas em
  // /comissionamento/categorias). O numerador/denominador são IDs
  // de categoria; a lista de produtos é resolvida pelo engine.
  const [mixNumeradorCatId,   setMixNumeradorCatId]   = useState<string>(
    (editar as any)?.mix_numerador_categoria_id ?? '',
  )
  const [mixDenominadorCatId, setMixDenominadorCatId] = useState<string>(
    (editar as any)?.mix_denominador_categoria_id ?? '',
  )
  const [categoriasDisp,      setCategoriasDisp]      = useState<{ id: string; nome: string; cor: string; qtd_produtos: number }[]>([])
  const [loadingCategorias,   setLoadingCategorias]   = useState(false)

  useEffect(() => {
    if (campo !== 'mix') return
    setLoadingCategorias(true)
    fetch('/api/comissionamento/categorias')
      .then(r => r.json())
      .then(json => {
        setCategoriasDisp((json.categorias ?? []).map((c: any) => ({
          id:   String(c.id),
          nome: String(c.nome),
          cor:  String(c.cor ?? '#6366f1'),
          qtd_produtos: Number(c.qtd_produtos ?? 0),
        })))
      })
      .catch(() => {})
      .finally(() => setLoadingCategorias(false))
  }, [campo])
  // Checklist template (só usado quando campo === 'checklist')
  const [checklistTemplateId, setChecklistTemplateId] = useState<string>(
    (editar as unknown as { checklist_template_id?: string })?.checklist_template_id ?? '',
  )
  const [templates, setTemplates] = useState<Array<{ id: string; nome: string }>>([])
  useEffect(() => {
    if (campo !== 'checklist') return
    fetch('/api/comissionamento/checklists/templates')
      .then(r => r.json())
      .then(d => setTemplates((d.templates ?? []).map((t: { id: string; nome: string }) => ({ id: t.id, nome: t.nome }))))
      .catch(() => {})
  }, [campo])
  const [valorMeta, setValorMeta] = useState<number>(editar?.valor_meta ?? 0)
  const [periodIni, setPeriodIni] = useState(editar?.period_start ?? '')
  const [periodFim, setPeriodFim] = useState(editar?.period_end ?? '')
  const [salvando, setSalvando] = useState(false)

  function addFiltro() {
    setFiltros(prev => [...prev, { tipo: 'grupo_produto', valores: [], modo: 'excluir' }])
  }
  function removeFiltro(idx: number) {
    setFiltros(prev => prev.filter((_, i) => i !== idx))
  }
  function updateFiltro(idx: number, patch: Partial<MetaFiltroRegra>) {
    setFiltros(prev => prev.map((f, i) => i === idx ? { ...f, ...patch } : f))
  }

  // Default period: mês corrente
  useEffect(() => {
    if (editar) return
    if (!periodIni && !periodFim) {
      const hoje = new Date()
      const ini  = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
      const fim  = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
      const f = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      setPeriodIni(f(ini)); setPeriodFim(f(fim))
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar() {
    if (!nome.trim()) { toast({ variant: 'destructive', title: 'Nome obrigatório' }); return }
    if (!periodIni || !periodFim) { toast({ variant: 'destructive', title: 'Período obrigatório' }); return }
    if (periodFim < periodIni) { toast({ variant: 'destructive', title: 'Período inválido', description: 'Fim deve ser >= Início' }); return }

    setSalvando(true)
    try {
      // Sanitiza: remove filtros sem valores selecionados
      const filtrosLimpos = filtros
        .filter(f => f.valores && f.valores.length > 0)
        .map(f => ({ tipo: f.tipo, valores: f.valores, modo: f.modo }))
      const payload: Record<string, unknown> = {
        posto_id:        props.postoId,
        grupo_id:        grupoId || null,
        nome:            nome.trim(),
        campo,
        filtros:         filtrosLimpos,
        valor_meta:      Number(valorMeta) || 0,
        period_start:    periodIni,
        period_end:      periodFim,
      }
      if (campo === 'mix') {
        payload.mix_numerador_categoria_id   = mixNumeradorCatId   || null
        payload.mix_denominador_categoria_id = mixDenominadorCatId || null
        // Limpa fallback legado (mix_* arrays) ao usar categorias
        payload.mix_numerador   = null
        payload.mix_denominador = null
      } else {
        payload.mix_numerador_categoria_id   = null
        payload.mix_denominador_categoria_id = null
        payload.mix_numerador   = null
        payload.mix_denominador = null
      }
      payload.checklist_template_id = campo === 'checklist' ? (checklistTemplateId || null) : null
      if (campo === 'checklist' && !checklistTemplateId) {
        toast({ variant: 'destructive', title: 'Selecione um template de checklist' })
        setSalvando(false)
        return
      }
      const r = editar
        ? await fetch(`/api/comissionamento/metas/${editar.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch('/api/comissionamento/metas', {
            method: 'POST',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
      const json = await r.json()
      if (!r.ok || json.error) {
        toast({ variant: 'destructive', title: 'Erro', description: json.error })
        return
      }
      toast({ title: editar ? 'Meta atualizada' : 'Meta criada', description: nome })
      await props.onSalvo()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={props.aberto} onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editar ? <Pencil className="w-4 h-4 text-blue-500" /> : <Target className="w-4 h-4 text-orange-500" />}
            {editar ? 'Editar meta' : 'Nova meta'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-7">
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Nome</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Meta de combustíveis Janeiro" />
            </div>
            <div className="md:col-span-5">
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Grupo</Label>
              <Select value={grupoId || '__none__'} onValueChange={(v) => setGrupoId(v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sem grupo —</SelectItem>
                  {props.grupos.map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-4">
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Acompanhar</Label>
              <Select value={campo} onValueChange={(v) => setCampo(v as MetaCampo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['faturamento','quantidade','margem','mix','markup','checklist'] as MetaCampo[]).map(c => {
                    const Icone = CAMPO_ICONE[c]
                    return (
                      <SelectItem key={c} value={c}>
                        <span className="flex items-center gap-1.5"><Icone className="w-3.5 h-3.5" /> {CAMPO_LABEL[c]}</span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-4">
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">
                Valor da meta {campo === 'faturamento' ? '(R$)' : campo === 'margem' || campo === 'mix' || campo === 'markup' ? '(%)' : campo === 'quantidade' ? '(un.)' : campo === 'checklist' ? '(pontos)' : ''}
              </Label>
              <Input
                type="number" step="0.01" min={0}
                value={valorMeta}
                onChange={e => setValorMeta(parseFloat(e.target.value) || 0)}
                placeholder={campo === 'mix' ? 'Ex.: 30 (= 30 %)' : undefined}
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Início</Label>
              <Input type="date" value={periodIni} onChange={e => setPeriodIni(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Fim</Label>
              <Input type="date" value={periodFim} onChange={e => setPeriodFim(e.target.value)} />
            </div>
          </div>

          {/* Configuração do checklist — só quando campo='checklist' */}
          {campo === 'checklist' && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/40 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-100/60 border-b border-slate-200">
                <ClipboardList className="w-3.5 h-3.5 text-slate-600" />
                <p className="text-[12.5px] font-semibold text-slate-900">Configuração do Checklist</p>
                <p className="text-[10.5px] text-slate-700 italic ml-1">
                  · realizado = total de pontos da aplicação mensal
                </p>
              </div>
              <div className="p-3">
                {templates.length === 0 ? (
                  <div className="text-[12px] text-slate-800 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2.5">
                    Nenhum template cadastrado.{' '}
                    <Link href="/comissionamento/checklists" className="underline font-semibold">
                      Cadastre um template
                    </Link>{' '}
                    para depois criar metas de checklist.
                  </div>
                ) : (
                  <>
                    <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Template</Label>
                    <Select value={checklistTemplateId} onValueChange={setChecklistTemplateId}>
                      <SelectTrigger><SelectValue placeholder="Selecione o template..." /></SelectTrigger>
                      <SelectContent>
                        {templates.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10.5px] text-slate-500 mt-1.5">
                      Alvo = <b>{valorMeta || 0}</b> pontos. Atingimento = pontos obtidos ÷ alvo × 100.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Configuração do mix — só quando campo='mix' */}
          {campo === 'mix' && (
            <div className="rounded-xl border border-purple-200 bg-purple-50/30 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-purple-100/60 border-b border-purple-200">
                <Layers className="w-3.5 h-3.5 text-purple-600" />
                <p className="text-[12.5px] font-semibold text-purple-900">Configuração do Mix</p>
                <p className="text-[10.5px] text-purple-700 italic ml-1">
                  · realizado = Σ qtd(numerador) ÷ Σ qtd(denominador) × 100
                </p>
              </div>

              {categoriasDisp.length === 0 && !loadingCategorias ? (
                <div className="p-3">
                  <div className="text-[12px] text-purple-800 bg-purple-100 border border-purple-200 rounded-lg px-3 py-2.5">
                    Nenhuma categoria de produto cadastrada.{' '}
                    <Link href="/comissionamento/categorias" className="underline font-semibold">
                      Cadastre categorias
                    </Link>{' '}
                    (ex.: &quot;Gasolina Aditivada&quot;, &quot;Gasolinas&quot;) e volte aqui para usar no mix.
                  </div>
                </div>
              ) : (
                <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">
                      Numerador (foco do mix)
                    </Label>
                    <Select value={mixNumeradorCatId || '__none__'} onValueChange={(v) => setMixNumeradorCatId(v === '__none__' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="Categoria…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Selecione —</SelectItem>
                        {categoriasDisp.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            <span className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.cor }} />
                              {c.nome}
                              <span className="text-[10.5px] text-gray-400">({c.qtd_produtos})</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">
                      Denominador (universo)
                    </Label>
                    <Select value={mixDenominadorCatId || '__none__'} onValueChange={(v) => setMixDenominadorCatId(v === '__none__' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="Categoria…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Selecione —</SelectItem>
                        {categoriasDisp.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            <span className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.cor }} />
                              {c.nome}
                              <span className="text-[10.5px] text-gray-400">({c.qtd_produtos})</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {mixNumeradorCatId && mixDenominadorCatId && (() => {
                const num = categoriasDisp.find(c => c.id === mixNumeradorCatId)
                const den = categoriasDisp.find(c => c.id === mixDenominadorCatId)
                if (!num || !den) return null
                return (
                  <div className="px-3 pb-3">
                    <div className="text-[10.5px] text-purple-800 bg-purple-100 border border-purple-200 rounded-lg px-2 py-1">
                      Mix = qtd vendida de <strong>{num.nome}</strong> ({num.qtd_produtos} produto{num.qtd_produtos === 1 ? '' : 's'}) ÷ qtd vendida de <strong>{den.nome}</strong> ({den.qtd_produtos} produto{den.qtd_produtos === 1 ? '' : 's'})
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Filtros de venda não fazem sentido para checklist (não vem de venda) */}
          {campo !== 'checklist' && (
          <div className="rounded-xl border border-gray-200 bg-gray-50/40 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-100/60 border-b border-gray-200">
              <Filter className="w-3.5 h-3.5 text-gray-500" />
              <p className="text-[12.5px] font-semibold text-gray-700">Filtrar vendas (opcional)</p>
              <p className="text-[10.5px] text-gray-500 italic ml-1">
                · {filtros.length === 0 ? 'todas as vendas contam' : `${filtros.length} regra${filtros.length === 1 ? '' : 's'} combinada${filtros.length === 1 ? '' : 's'} por E`}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addFiltro}
                className="ml-auto h-7 gap-1.5 text-[11.5px] px-2.5"
              >
                <Plus className="w-3 h-3" /> Adicionar filtro
              </Button>
            </div>
            <div className="p-3 space-y-2">
              {filtros.length === 0 ? (
                <p className="text-[11.5px] text-gray-400 italic">
                  Sem filtros — toda venda do posto/período entra no cálculo da meta. Use o botão acima para excluir grupos/subgrupos/produtos específicos.
                </p>
              ) : (
                filtros.map((f, idx) => (
                  <FiltroMetaLinha
                    key={idx}
                    filtro={f}
                    gruposAS={props.gruposAS}
                    subgruposAS={props.subgruposAS}
                    onChange={(patch) => updateFiltro(idx, patch)}
                    onRemove={() => removeFiltro(idx)}
                  />
                ))
              )}
            </div>
          </div>
          )}

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={props.onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando} className="gap-2 bg-gray-900 hover:bg-black text-white">
            {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {editar ? 'Salvar alterações' : 'Criar meta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Componente: seleção de valores de filtro (varia por tipo) ───────────────

interface FiltroValoresInputProps {
  tipo:        MetaFiltro
  valores:     string[]
  onChange:    (v: string[]) => void
  gruposAS:    AsItem[]
  subgruposAS: AsItem[]
}
function FiltroValoresInput({ tipo, valores, onChange, gruposAS, subgruposAS }: FiltroValoresInputProps) {
  // produto_tipo → checkboxes hardcoded
  if (tipo === 'produto_tipo') {
    return (
      <div>
        <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Tipos de produto</Label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
          {PRODUTO_TIPOS.map(t => {
            const sel = valores.includes(t.value)
            return (
              <label key={t.value} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={sel}
                  onChange={() => onChange(sel ? valores.filter(x => x !== t.value) : [...valores, t.value])}
                  className="accent-orange-500 w-3.5 h-3.5"
                />
                <span className="text-[12px] text-gray-700">{t.label}</span>
              </label>
            )
          })}
        </div>
      </div>
    )
  }

  // grupo_produto / subgrupo_produto → multi-checkbox da lista AS
  if (tipo === 'grupo_produto' || tipo === 'subgrupo_produto') {
    const lista = (tipo === 'grupo_produto' ? gruposAS : subgruposAS).slice().sort((a, b) => a.nome.localeCompare(b.nome))
    return (
      <div>
        <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">
          {tipo === 'grupo_produto' ? 'Grupos' : 'Subgrupos'} ({valores.length} selecionado{valores.length === 1 ? '' : 's'})
        </Label>
        <div className="max-h-44 overflow-y-auto border border-gray-200 rounded-lg bg-white p-1.5 space-y-0.5">
          {lista.length === 0 && (
            <p className="px-2 py-3 text-[11.5px] text-gray-400 italic">Nenhum {tipo === 'grupo_produto' ? 'grupo' : 'subgrupo'} encontrado no AUTOSYSTEM</p>
          )}
          {lista.map(g => {
            const sel = valores.includes(g.nome)
            return (
              <label key={g.grid} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sel}
                  onChange={() => onChange(sel ? valores.filter(x => x !== g.nome) : [...valores, g.nome])}
                  className="accent-orange-500 w-3.5 h-3.5"
                />
                <span className="text-[12px] text-gray-700 truncate">{g.nome}</span>
              </label>
            )
          })}
        </div>
      </div>
    )
  }

  // produto → multi-select com busca no AUTOSYSTEM
  return <ProdutoMultiSelect valores={valores} onChange={onChange} />
}

// ── Diálogo: distribuir meta entre vendedores (splits) ──────────────────────

interface DialogSplitsProps {
  aberto:         boolean
  meta:           Meta
  membros:        ComissioMembro[]
  splitsIniciais: SplitRow[] | null
  onClose:        () => void
  onSalvo:        () => void | Promise<void>
}
function DialogSplits({ aberto, meta, membros, splitsIniciais, onClose, onSalvo }: DialogSplitsProps) {
  // valores: membro_id → valor_meta
  const [valores, setValores] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(splitsIniciais === null)
  const [salvando, setSalvando] = useState(false)

  // Inicialização: usa cache se houver, senão busca
  useEffect(() => {
    let cancelled = false
    async function init() {
      if (splitsIniciais !== null) {
        const map: Record<string, number> = {}
        for (const s of splitsIniciais) map[s.membro_id] = s.valor_meta
        if (!cancelled) { setValores(map); setLoading(false) }
        return
      }
      setLoading(true)
      try {
        const json = await fetch(`/api/comissionamento/metas/${meta.id}`).then(r => r.json())
        const splits = (json.splits ?? []) as SplitRow[]
        if (cancelled) return
        const map: Record<string, number> = {}
        for (const s of splits) map[s.membro_id] = s.valor_meta
        setValores(map)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    init()
    return () => { cancelled = true }
  }, [meta.id, splitsIniciais])

  const membrosAtivos = useMemo(
    () => membros.filter(m => m.ativo).sort((a, b) => a.nome.localeCompare(b.nome)),
    [membros],
  )
  const total = useMemo(
    () => Object.values(valores).reduce((s, v) => s + (v || 0), 0),
    [valores],
  )
  const pct = meta.valor_meta > 0 ? (total / meta.valor_meta) * 100 : 0
  const restante = meta.valor_meta - total

  function setValor(mid: string, v: number) {
    setValores(prev => ({ ...prev, [mid]: v }))
  }
  function dividirIgual() {
    if (membrosAtivos.length === 0 || meta.valor_meta <= 0) return
    const each = meta.valor_meta / membrosAtivos.length
    const map: Record<string, number> = {}
    for (const m of membrosAtivos) map[m.id] = Number(each.toFixed(2))
    setValores(map)
  }
  function zerar() {
    setValores({})
  }

  async function salvar() {
    setSalvando(true)
    try {
      const splits = membrosAtivos
        .map(m => ({ membro_id: m.id, valor_meta: Number(valores[m.id]) || 0 }))
        .filter(s => s.valor_meta > 0)
      const r = await fetch(`/api/comissionamento/metas/${meta.id}/splits`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ splits }),
      })
      const json = await r.json()
      if (!r.ok || json.error) {
        toast({ variant: 'destructive', title: 'Erro', description: json.error })
        return
      }
      toast({ title: 'Distribuição salva', description: `${splits.length} vendedor${splits.length === 1 ? '' : 'es'}` })
      await onSalvo()
    } finally {
      setSalvando(false)
    }
  }

  const unidade = meta.campo === 'faturamento' ? 'R$' : meta.campo === 'margem' || meta.campo === 'markup' || meta.campo === 'mix' ? '%' : meta.campo === 'quantidade' ? 'un.' : ''

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UsersIcon className="w-4 h-4 text-blue-500" />
            Distribuir meta: <span className="font-normal text-gray-600">{meta.nome}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2 overflow-y-auto flex-1 pr-1">
          {/* Resumo no topo */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 grid grid-cols-3 gap-3">
            <ResumoBox titulo="Meta total"     valor={valorPorCampo(meta.valor_meta, meta.campo)} />
            <ResumoBox titulo="Alocado"        valor={valorPorCampo(total, meta.campo)}    cor={pct >= 100 ? 'emerald' : pct >= 70 ? 'amber' : 'gray'} />
            <ResumoBox titulo="Restante"       valor={valorPorCampo(restante, meta.campo)} cor={restante < 0 ? 'rose' : restante === 0 ? 'emerald' : 'gray'} />
          </div>

          {/* Atalhos */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={dividirIgual} disabled={membrosAtivos.length === 0} className="text-[11.5px] gap-1.5">
              <Layers className="w-3 h-3" /> Dividir igualmente
            </Button>
            <Button variant="outline" size="sm" onClick={zerar} className="text-[11.5px]">Zerar todos</Button>
          </div>

          {/* Lista de membros */}
          {loading ? (
            <div className="py-10 flex items-center justify-center text-gray-400 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> <span className="text-[12.5px]">Carregando splits…</span>
            </div>
          ) : membrosAtivos.length === 0 ? (
            <p className="text-[12.5px] text-gray-500 italic text-center py-6">Nenhum membro ativo neste posto. Cadastre membros em <strong>Comissionamento → Membros</strong>.</p>
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full text-[12.5px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-[11px] uppercase tracking-wide text-gray-500">
                    <th className="text-left  px-3 py-2">Vendedor</th>
                    <th className="text-left  px-3 py-2 w-32">Papel</th>
                    <th className="text-right px-3 py-2 w-40">Meta individual ({unidade || '—'})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {membrosAtivos.map(m => (
                    <tr key={m.id} className="hover:bg-gray-50/50">
                      <td className="px-3 py-2 font-medium text-gray-800">{m.nome}</td>
                      <td className="px-3 py-2 text-gray-500">{m.role}</td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={valores[m.id] ?? ''}
                          onChange={e => setValor(m.id, parseFloat(e.target.value) || 0)}
                          className="h-8 text-right tabular-nums"
                          placeholder="0,00"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || loading} className="gap-2 bg-gray-900 hover:bg-black text-white">
            {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Salvar distribuição
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ResumoBox({ titulo, valor, cor }: { titulo: string; valor: string; cor?: 'emerald' | 'amber' | 'rose' | 'gray' }) {
  const cores: Record<NonNullable<typeof cor>, string> = {
    emerald: 'text-emerald-700',
    amber:   'text-amber-700',
    rose:    'text-rose-700',
    gray:    'text-gray-900',
  }
  return (
    <div>
      <p className="text-[10.5px] uppercase tracking-wide text-gray-500 font-medium">{titulo}</p>
      <p className={cn('text-[15px] font-bold tabular-nums mt-0.5', cores[cor ?? 'gray'])}>{valor}</p>
    </div>
  )
}

// ── FiltroMetaLinha ─────────────────────────────────────────────────────────
// Uma linha de filtro do `DialogMeta`. Mesmo padrão usado em /esquemas/[id]
// para o `product_filters` do esquema — reuso visual proposital.

interface FiltroMetaLinhaProps {
  filtro:      MetaFiltroRegra
  gruposAS:    AsItem[]
  subgruposAS: AsItem[]
  onChange:    (patch: Partial<MetaFiltroRegra>) => void
  onRemove:    () => void
}
function FiltroMetaLinha({ filtro, gruposAS, subgruposAS, onChange, onRemove }: FiltroMetaLinhaProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-end gap-2 flex-wrap">
        <div className="min-w-[180px]">
          <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Tipo</Label>
          <Select
            value={filtro.tipo}
            onValueChange={(v) => onChange({ tipo: v as MetaFiltro, valores: [] })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="produto">{FILTRO_LABEL.produto}</SelectItem>
              <SelectItem value="grupo_produto">{FILTRO_LABEL.grupo_produto}</SelectItem>
              <SelectItem value="subgrupo_produto">{FILTRO_LABEL.subgrupo_produto}</SelectItem>
              <SelectItem value="produto_tipo">{FILTRO_LABEL.produto_tipo}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[160px]">
          <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Modo</Label>
          <Select value={filtro.modo} onValueChange={(v) => onChange({ modo: v as MetaModo })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="incluir">Incluir apenas</SelectItem>
              <SelectItem value="excluir">Excluir</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto">
          <button
            type="button"
            onClick={onRemove}
            title="Remover filtro"
            className="p-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-3">
        <FiltroValoresInput
          tipo={filtro.tipo}
          valores={filtro.valores}
          onChange={(v) => onChange({ valores: v })}
          gruposAS={gruposAS}
          subgruposAS={subgruposAS}
        />
      </div>
    </div>
  )
}

// ── Modal: Duplicar grupo ──────────────────────────────────────────────────
//
// Dois destinos:
//   • Só este posto → chama /duplicar (simples, comportamento anterior)
//   • Em todas as empresas do esquema → chama /duplicar-rede
// No modo rede, precisamos escolher UM esquema (posto pode estar em vários).
// Se estiver em 1 só, seleciona automaticamente e mostra a contagem.

interface EsquemaComPostos {
  id: string; nome: string; status: string
  postos: Array<{ id: string; nome: string }>
}
interface DialogDuplicarGrupoProps {
  grupo: MetaGrupo
  onClose: () => void
  onFeito: (novoGrupoIdSelecionar: string | null) => void | Promise<void>
}
// Sugere período do próximo mês a partir do período do grupo origem.
// - Se o origem tem period_start, avança 1 mês; senão, usa mês corrente.
// - period_start = dia 1 do próximo mês
// - period_end   = último dia do próximo mês (independente da duração original)
// Também tenta sugerir um nome baseado no padrão "MM/YYYY" do nome original.
function sugerirProximoMes(grupo: MetaGrupo): { nome: string; ini: string; fim: string } {
  const base = grupo.period_start
    ? new Date(`${grupo.period_start}T00:00:00`)
    : new Date()
  const proxIni = new Date(base.getFullYear(), base.getMonth() + 1, 1)
  const proxFim = new Date(proxIni.getFullYear(), proxIni.getMonth() + 1, 0)  // dia 0 do próximo = último do atual
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  // Substitui "MM/YYYY" no nome original pelo novo par (comum: "Mês 05/2026" → "Mês 06/2026")
  const mmYyyy = /\b(\d{2})\/(\d{4})\b/
  const mmNovo = String(proxIni.getMonth() + 1).padStart(2, '0')
  const yyyyNovo = String(proxIni.getFullYear())
  const nomeSugerido = mmYyyy.test(grupo.nome)
    ? grupo.nome.replace(mmYyyy, `${mmNovo}/${yyyyNovo}`)
    : `${grupo.nome} (cópia)`

  return { nome: nomeSugerido, ini: fmt(proxIni), fim: fmt(proxFim) }
}

function DialogDuplicarGrupo({ grupo, onClose, onFeito }: DialogDuplicarGrupoProps) {
  const sugerido = useMemo(() => sugerirProximoMes(grupo), [grupo])
  const [nome, setNome] = useState(sugerido.nome)
  const [periodIni, setPeriodIni] = useState(sugerido.ini)
  const [periodFim, setPeriodFim] = useState(sugerido.fim)
  const [modo, setModo] = useState<'posto' | 'rede'>('posto')
  const [esquemas, setEsquemas] = useState<EsquemaComPostos[]>([])
  const [esquemaId, setEsquemaId] = useState<string>('')
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  // Metas do grupo origem — para o usuário escolher quais duplicar e quais
  // manter valor original ao invés de zerar.
  const [metasOrigem, setMetasOrigem] = useState<Meta[]>([])
  const [incluir, setIncluir] = useState<Set<string>>(new Set())
  const [preservar, setPreservar] = useState<Set<string>>(new Set())
  useEffect(() => {
    fetch(`/api/comissionamento/metas?grupo_id=${grupo.id}`)
      .then(r => r.json())
      .then((j: { metas?: Meta[] }) => {
        const lista = j.metas ?? []
        setMetasOrigem(lista)
        setIncluir(new Set(lista.map(m => m.id)))  // todas incluídas por padrão
        // preservar começa vazio — o usuário marca as que fazem sentido
      })
      .catch(() => setMetasOrigem([]))
  }, [grupo.id])
  function toggleIncluir(id: string) {
    setIncluir(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id); const p = new Set(preservar); p.delete(id); setPreservar(p) }
      else next.add(id)
      return next
    })
  }
  function togglePreservar(id: string) {
    if (!incluir.has(id)) return
    setPreservar(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  useEffect(() => {
    setCarregando(true)
    fetch(`/api/comissionamento/metas/grupos/${grupo.id}/esquemas-do-posto`)
      .then(r => r.json())
      .then((j: { esquemas?: EsquemaComPostos[] }) => {
        const lista = j.esquemas ?? []
        setEsquemas(lista)
        if (lista.length === 1) setEsquemaId(lista[0].id)
      })
      .catch(() => setEsquemas([]))
      .finally(() => setCarregando(false))
  }, [grupo.id])

  const esquemaEscolhido = esquemas.find(e => e.id === esquemaId)
  const totalPostosRede = esquemaEscolhido?.postos.length ?? 0

  async function executar() {
    if (!nome.trim()) {
      toast({ variant: 'destructive', title: 'Nome é obrigatório' })
      return
    }
    if (!periodIni || !periodFim) {
      toast({ variant: 'destructive', title: 'Preencha o período (início e fim)' })
      return
    }
    if (periodFim < periodIni) {
      toast({ variant: 'destructive', title: 'Fim do período deve ser >= início' })
      return
    }
    setSalvando(true)
    try {
      if (modo === 'posto') {
        const r = await fetch(`/api/comissionamento/metas/grupos/${grupo.id}/duplicar`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome: nome.trim(), period_start: periodIni, period_end: periodFim,
            metas_incluir_ids:         Array.from(incluir),
            metas_preservar_valor_ids: Array.from(preservar),
          }),
        })
        const j = await r.json().catch(() => ({}))
        if (!r.ok || j.error) throw new Error(j.error ?? 'erro')
        toast({
          title: 'Grupo duplicado',
          description: `${j.metas_criadas ?? 0} meta(s) copiada(s). Defina os valores e a distribuição.`,
        })
        onFeito(j.grupo?.id ?? null)
      } else {
        if (!esquemaId) {
          toast({ variant: 'destructive', title: 'Escolha o esquema para replicar' })
          setSalvando(false)
          return
        }
        const r = await fetch(`/api/comissionamento/metas/grupos/${grupo.id}/duplicar-rede`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome: nome.trim(), esquema_id: esquemaId,
            period_start: periodIni, period_end: periodFim,
            metas_incluir_ids:         Array.from(incluir),
            metas_preservar_valor_ids: Array.from(preservar),
          }),
        })
        const j = await r.json().catch(() => ({}))
        if (!r.ok || j.error) throw new Error(j.error ?? 'erro')
        const criados = j.grupos_criados ?? 0
        const metas   = j.metas_criadas_total ?? 0
        const erros   = j.erros ?? 0
        toast({
          title: 'Duplicação em rede concluída',
          description: `${criados} grupo(s) criado(s) em ${criados} posto(s), ${metas} meta(s) total.${erros > 0 ? ` ${erros} posto(s) com erro.` : ''}`,
        })
        // Seleciona o grupo criado NO POSTO ATUAL (se existir na resposta)
        const meu = (j.postos as Array<{ posto_id: string; grupo_novo_id: string | null }> | undefined)
          ?.find(p => p.posto_id === grupo.posto_id)
        onFeito(meu?.grupo_novo_id ?? null)
      }
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao duplicar', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl w-[min(95vw,42rem)] max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-gray-200 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="w-4 h-4 text-emerald-600" /> Duplicar grupo
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Nome do novo grupo</Label>
            <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Mês 06/2026" autoFocus />
          </div>

          {/* Período — pré-preenchido com o mês seguinte ao do grupo origem */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Início do período</Label>
              <Input type="date" value={periodIni} onChange={e => setPeriodIni(e.target.value)} />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Fim do período</Label>
              <Input type="date" value={periodFim} onChange={e => setPeriodFim(e.target.value)} />
            </div>
            <p className="col-span-2 text-[10.5px] text-gray-500 -mt-1">
              O grupo E as metas duplicadas passam a apontar pra esse período. Se você deixar como está, cada meta copiada aparece já no mês novo — sem precisar editar meta por meta.
            </p>
          </div>

          {/* Metas a duplicar — escolhe quais copiar e quais preservam o valor original */}
          {metasOrigem.length > 0 && (
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-1.5">
                <Label className="text-[11px] uppercase tracking-wide text-gray-500">
                  Metas ({incluir.size} de {metasOrigem.length} selecionadas)
                </Label>
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => { setIncluir(new Set(metasOrigem.map(m => m.id))); setPreservar(new Set()) }}
                    className="text-[10.5px] text-gray-500 hover:text-gray-800 underline whitespace-nowrap"
                  >Todas · zerar valores</button>
                  <span className="text-gray-300">·</span>
                  <button
                    type="button"
                    onClick={() => { setIncluir(new Set(metasOrigem.map(m => m.id))); setPreservar(new Set(metasOrigem.map(m => m.id))) }}
                    className="text-[10.5px] text-gray-500 hover:text-gray-800 underline whitespace-nowrap"
                  >Todas · manter valores</button>
                </div>
              </div>
              <div className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-52 overflow-y-auto">
                {metasOrigem.map(m => {
                  const inc = incluir.has(m.id)
                  const pres = preservar.has(m.id)
                  return (
                    <div key={m.id} className={cn('flex items-start gap-2 px-2.5 py-1.5 text-[11.5px]', !inc && 'opacity-50')}>
                      <input
                        type="checkbox" checked={inc} onChange={() => toggleIncluir(m.id)}
                        className="flex-shrink-0 mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 truncate" title={m.nome}>{m.nome}</p>
                        <p className="text-[10.5px] text-gray-500 truncate">
                          {CAMPO_LABEL[m.campo]} · valor original: <b className="text-gray-700">{valorPorCampo(Number(m.valor_meta), m.campo)}</b>
                        </p>
                      </div>
                      <label className={cn(
                        'flex items-center gap-1 text-[10.5px] flex-shrink-0 mt-0.5',
                        inc ? 'text-gray-700 cursor-pointer' : 'text-gray-300 cursor-not-allowed',
                      )}>
                        <input
                          type="checkbox" checked={pres} disabled={!inc}
                          onChange={() => togglePreservar(m.id)}
                        />
                        <span className="whitespace-nowrap">Manter valor</span>
                      </label>
                    </div>
                  )
                })}
              </div>
              {preservar.size > 0 && (
                <p className="text-[10.5px] text-emerald-700 mt-1.5">
                  ✓ {preservar.size} meta{preservar.size === 1 ? '' : 's'} manterá{preservar.size === 1 ? '' : 'ão'} o valor original. As demais entram zeradas.
                </p>
              )}
            </div>
          )}

          <div>
            <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Onde criar</Label>
            <div className="flex flex-col gap-1.5">
              <label className={cn(
                'flex items-start gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors',
                modo === 'posto' ? 'border-emerald-400 bg-emerald-50/50' : 'border-gray-200 bg-white',
              )}>
                <input
                  type="radio" name="dupmodo" className="mt-0.5"
                  checked={modo === 'posto'}
                  onChange={() => setModo('posto')}
                />
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-gray-800">Só neste posto</p>
                  <p className="text-[11px] text-gray-500">Cria o grupo apenas na empresa atual — mesmo comportamento de antes.</p>
                </div>
              </label>
              <label className={cn(
                'flex items-start gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors',
                modo === 'rede' ? 'border-emerald-400 bg-emerald-50/50' : 'border-gray-200 bg-white',
              )}>
                <input
                  type="radio" name="dupmodo" className="mt-0.5"
                  checked={modo === 'rede'}
                  onChange={() => setModo('rede')}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold text-gray-800">Em todas as empresas do esquema</p>
                  <p className="text-[11px] text-gray-500">
                    Cria o mesmo grupo (com as mesmas metas zeradas, sem distribuição) em cada empresa vinculada ao esquema escolhido.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {modo === 'rede' && (
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Esquema de referência</Label>
              {carregando ? (
                <p className="text-[12px] text-gray-500 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Buscando esquemas...</p>
              ) : esquemas.length === 0 ? (
                <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded">
                  Este posto não está vinculado a nenhum esquema. Vincule primeiro em Esquemas.
                </p>
              ) : (
                <>
                  <Select value={esquemaId} onValueChange={setEsquemaId}>
                    <SelectTrigger><SelectValue placeholder="Selecione o esquema..." /></SelectTrigger>
                    <SelectContent>
                      {esquemas.map(e => (
                        <SelectItem key={e.id} value={e.id}>
                          <span className="flex items-center gap-2">
                            {e.nome}
                            <span className="text-[10px] text-gray-400">· {e.postos.length} posto{e.postos.length === 1 ? '' : 's'}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {esquemaEscolhido && (
                    <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2">
                      <p className="text-[11px] text-emerald-800">
                        Será criado em <b>{totalPostosRede} posto{totalPostosRede === 1 ? '' : 's'}</b>:
                      </p>
                      <p className="text-[10.5px] text-emerald-700/80 mt-0.5 leading-snug break-words">
                        {esquemaEscolhido.postos.map(p => p.nome).join(' · ')}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="px-5 py-3 border-t border-gray-200 flex-shrink-0 bg-white">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={executar}
            disabled={salvando || (modo === 'rede' && !esquemaId)}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
          >
            {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
            {modo === 'posto' ? 'Duplicar aqui' : `Duplicar em ${totalPostosRede} posto${totalPostosRede === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
