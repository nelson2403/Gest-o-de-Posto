'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils/cn'
import {
  ArrowLeft, Plus, Loader2, AlertCircle, Save, Pencil, Trash2,
  Tag, Package, Palette,
} from 'lucide-react'
import { ProdutoMultiSelectItems, type ProdutoItem } from '../_components/ProdutoMultiSelect'
import type { Categoria } from '@/app/api/comissionamento/categorias/route'

const CORES_SUGERIDAS = [
  '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#84cc16',
  '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#a855f7',
]

export default function CategoriasPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading,    setLoading]    = useState(true)
  const [erro,       setErro]       = useState<string | null>(null)

  const [dialogOpen, setDialogOpen]   = useState(false)
  const [editando,   setEditando]     = useState<Categoria | null>(null)
  const [excluindo,  setExcluindo]    = useState<Categoria | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const r = await fetch('/api/comissionamento/categorias')
      const json = await r.json()
      if (!r.ok || json.error) {
        setErro(json.error ?? `Erro HTTP ${r.status}`)
        return
      }
      setCategorias((json.categorias ?? []) as Categoria[])
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  function abrirNova()  { setEditando(null); setDialogOpen(true) }
  function abrirEditar(c: Categoria) { setEditando(c); setDialogOpen(true) }

  async function confirmarExcluir() {
    if (!excluindo) return
    const r = await fetch(`/api/comissionamento/categorias/${excluindo.id}`, { method: 'DELETE' })
    const json = await r.json().catch(() => ({}))
    if (!r.ok || json.error) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: json.error })
      return
    }
    toast({ title: 'Categoria excluída' })
    setExcluindo(null)
    await carregar()
  }

  return (
    <div className="flex flex-col min-h-full">
      <Header
        title="Categorias de produto"
        description="Organize produtos do AUTOSYSTEM em categorias reutilizáveis para metas de mix"
        actions={
          <Link href="/comissionamento"
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-[12.5px]">
            <ArrowLeft className="w-3.5 h-3.5" /> Comissionamento
          </Link>
        }
      />

      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-2.5 bg-white/95 border-b border-gray-200/80 flex-shrink-0">
        <p className="text-[12px] text-gray-500">
          {categorias.length} categoria{categorias.length === 1 ? '' : 's'} cadastrada{categorias.length === 1 ? '' : 's'}
        </p>
        <Button onClick={abrirNova} className="gap-1.5 bg-gray-900 hover:bg-black text-white text-[12.5px]">
          <Plus className="w-3.5 h-3.5" /> Nova categoria
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {erro && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px] mb-4">
            <AlertCircle className="w-4 h-4 mt-0.5" />
            <p>{erro}</p>
          </div>
        )}

        {loading && categorias.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-[13px]">Carregando categorias…</span>
          </div>
        ) : categorias.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <Tag className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-[13px] font-medium text-gray-700">Nenhuma categoria criada</p>
            <p className="text-[12px] text-gray-500 mt-1 mb-4 max-w-md">
              Categorias agrupam produtos do AUTOSYSTEM. Use em metas de mix
              (ex.: "Gasolina Aditivada" / "Gasolinas") para evitar repetir
              listas de produtos em várias metas.
            </p>
            <Button onClick={abrirNova} className="gap-1.5 bg-gray-900 hover:bg-black text-white text-[12.5px]">
              <Plus className="w-3.5 h-3.5" /> Criar primeira categoria
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {categorias.map(c => (
              <CategoriaCard
                key={c.id}
                categoria={c}
                onEdit={() => abrirEditar(c)}
                onDelete={() => setExcluindo(c)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialog criar/editar */}
      {dialogOpen && (
        <DialogCategoria
          aberto={dialogOpen}
          editar={editando}
          onClose={() => setDialogOpen(false)}
          onSalvo={async () => {
            setDialogOpen(false)
            await carregar()
          }}
        />
      )}

      {/* Confirmar exclusão */}
      <Dialog open={!!excluindo} onOpenChange={(o) => !o && setExcluindo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="w-4 h-4" /> Excluir categoria
            </DialogTitle>
          </DialogHeader>
          {excluindo && (
            <p className="text-[13.5px] text-gray-700 py-2">
              Excluir a categoria <strong>{excluindo.nome}</strong>?
              <br />
              <span className="text-[12px] text-gray-500">
                Metas que usam esta categoria perderão a referência (campos voltam a null).
              </span>
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluindo(null)}>Cancelar</Button>
            <Button onClick={confirmarExcluir} className="bg-red-600 hover:bg-red-700 text-white gap-2">
              <Trash2 className="w-3.5 h-3.5" /> Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── CategoriaCard ───────────────────────────────────────────────────────────

interface CategoriaCardProps {
  categoria: Categoria
  onEdit:    () => void
  onDelete:  () => void
}
function CategoriaCard({ categoria, onEdit, onDelete }: CategoriaCardProps) {
  return (
    <Card
      className="border-gray-200 hover:border-gray-300 transition-colors group cursor-pointer"
      onClick={onEdit}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1 flex items-start gap-2">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0 mt-1"
              style={{ backgroundColor: categoria.cor || '#6366f1' }}
            />
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-gray-900 truncate">{categoria.nome}</p>
              {categoria.descricao && (
                <p className="text-[11px] text-gray-500 line-clamp-2">{categoria.descricao}</p>
              )}
            </div>
          </div>
          <div className="opacity-0 group-hover:opacity-100 flex items-center transition-opacity flex-shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit() }}
              title="Editar"
              className="p-1.5 rounded-md text-gray-500 hover:text-blue-600 hover:bg-blue-50"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              title="Excluir"
              className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-gray-600 pt-2 border-t border-gray-100 mt-2">
          <Package className="w-3 h-3 text-gray-400" />
          <strong>{categoria.qtd_produtos ?? 0}</strong> produto{categoria.qtd_produtos === 1 ? '' : 's'} vinculado{categoria.qtd_produtos === 1 ? '' : 's'}
        </div>
      </CardContent>
    </Card>
  )
}

// ── DialogCategoria ─────────────────────────────────────────────────────────

interface DialogCategoriaProps {
  aberto:  boolean
  editar:  Categoria | null
  onClose: () => void
  onSalvo: () => void | Promise<void>
}
function DialogCategoria({ aberto, editar, onClose, onSalvo }: DialogCategoriaProps) {
  const [nome,      setNome]      = useState(editar?.nome ?? '')
  const [descricao, setDescricao] = useState(editar?.descricao ?? '')
  const [cor,       setCor]       = useState(editar?.cor ?? '#6366f1')
  const [produtos,  setProdutos]  = useState<ProdutoItem[]>([])
  const [carregandoProdutos, setCarregandoProdutos] = useState(!!editar)
  const [salvando,  setSalvando]  = useState(false)

  // Carrega produtos vinculados quando editando
  useEffect(() => {
    if (!editar) return
    let cancelled = false
    setCarregandoProdutos(true)
    fetch(`/api/comissionamento/categorias/${editar.id}`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return
        const ps: ProdutoItem[] = (json.produtos ?? []).map((p: any) => ({
          grid: Number(p.produto_grid),
          nome: String(p.produto_nome),
        }))
        setProdutos(ps)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setCarregandoProdutos(false) })
    return () => { cancelled = true }
  }, [editar])

  async function salvar() {
    if (!nome.trim()) {
      toast({ variant: 'destructive', title: 'Nome obrigatório' })
      return
    }
    setSalvando(true)
    try {
      const payload = { nome: nome.trim(), descricao: descricao.trim(), cor }
      const r = editar
        ? await fetch(`/api/comissionamento/categorias/${editar.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch('/api/comissionamento/categorias', {
            method: 'POST',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
      const json = await r.json()
      if (!r.ok || json.error) {
        toast({ variant: 'destructive', title: 'Erro', description: json.error })
        return
      }
      const categoriaId = (editar ? editar.id : json.categoria?.id) as string

      // Salva lista de produtos vinculados (PUT substitui)
      const rp = await fetch(`/api/comissionamento/categorias/${categoriaId}/produtos`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produtos: produtos.map(p => ({ grid: p.grid, nome: p.nome })) }),
      })
      const jp = await rp.json().catch(() => ({}))
      if (!rp.ok || jp.error) {
        toast({ variant: 'destructive', title: 'Erro ao salvar produtos', description: jp.error })
        return
      }

      toast({ title: editar ? 'Categoria atualizada' : 'Categoria criada', description: `${produtos.length} produto${produtos.length === 1 ? '' : 's'} vinculado${produtos.length === 1 ? '' : 's'}` })
      await onSalvo()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editar ? <Pencil className="w-4 h-4 text-blue-500" /> : <Tag className="w-4 h-4 text-indigo-500" />}
            {editar ? 'Editar categoria' : 'Nova categoria'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-8">
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Nome</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Gasolina Aditivada" />
            </div>
            <div className="md:col-span-4">
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block flex items-center gap-1">
                <Palette className="w-3 h-3" /> Cor
              </Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={cor}
                  onChange={e => setCor(e.target.value)}
                  className="h-9 w-9 rounded border border-gray-200 cursor-pointer"
                />
                <div className="flex flex-wrap gap-1">
                  {CORES_SUGERIDAS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCor(c)}
                      className={cn(
                        'w-5 h-5 rounded-full border-2 transition-transform',
                        cor === c ? 'border-gray-900 scale-110' : 'border-white hover:scale-110',
                      )}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Descrição (opcional)</Label>
            <Textarea
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Para que serve esta categoria?"
              rows={2}
            />
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50/40 p-3">
            <p className="text-[11.5px] font-semibold text-gray-700 mb-1.5">Produtos vinculados</p>
            <p className="text-[10.5px] text-gray-500 mb-2.5">
              Adicione todos os produtos do AUTOSYSTEM que pertencem a esta categoria.
              O cadastro aceita produtos de qualquer tipo (combustíveis, mercadoria, etc.).
            </p>
            {carregandoProdutos ? (
              <div className="py-6 flex items-center justify-center text-gray-400 gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-[12px]">Carregando produtos vinculados…</span>
              </div>
            ) : (
              <ProdutoMultiSelectItems
                itens={produtos}
                onChange={setProdutos}
                label=""
                placeholder="Buscar produto no AUTOSYSTEM…"
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando} className="gap-2 bg-gray-900 hover:bg-black text-white">
            {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {editar ? 'Salvar alterações' : 'Criar categoria'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
