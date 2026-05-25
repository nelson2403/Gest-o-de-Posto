'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
  ArrowLeft, Plus, Search, Loader2, ClipboardList, ChevronRight,
  Trash2, Pencil, AlertCircle, CheckCircle2, XCircle, FileText,
} from 'lucide-react'
import type { Esquema, EsquemaStatus } from '@/app/api/comissionamento/esquemas/route'

const STATUS_LABELS: Record<EsquemaStatus, string> = {
  rascunho: 'Rascunho',
  ativo:    'Ativo',
  inativo:  'Inativo',
}

const STATUS_CORES: Record<EsquemaStatus, string> = {
  rascunho: 'bg-amber-100 text-amber-700 border-amber-200',
  ativo:    'bg-emerald-100 text-emerald-700 border-emerald-200',
  inativo:  'bg-gray-100 text-gray-600 border-gray-200',
}

export default function EsquemasListPage() {
  const [esquemas, setEsquemas] = useState<Esquema[]>([])
  const [loading,  setLoading]  = useState(true)
  const [erro,     setErro]     = useState<string | null>(null)
  const [busca,    setBusca]    = useState('')
  const [statusFiltro, setStatusFiltro] = useState<'todos' | EsquemaStatus>('todos')

  // Diálogo de criação
  const [criarOpen, setCriarOpen] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novaDescricao, setNovaDescricao] = useState('')
  const [novoStatus, setNovoStatus] = useState<EsquemaStatus>('rascunho')
  const [salvando, setSalvando] = useState(false)

  // Confirmar exclusão
  const [excluindo, setExcluindo] = useState<Esquema | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const r = await fetch('/api/comissionamento/esquemas')
      const json = await r.json()
      if (!r.ok || json.error) {
        setErro(json.error ?? `Erro HTTP ${r.status}`)
        setEsquemas([])
        return
      }
      setEsquemas(json.esquemas ?? [])
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return esquemas.filter(e => {
      if (statusFiltro !== 'todos' && e.status !== statusFiltro) return false
      if (!termo) return true
      return e.nome.toLowerCase().includes(termo) || e.descricao.toLowerCase().includes(termo)
    })
  }, [esquemas, busca, statusFiltro])

  function abrirCriar() {
    setNovoNome('')
    setNovaDescricao('')
    setNovoStatus('rascunho')
    setCriarOpen(true)
  }

  async function confirmarCriar() {
    if (!novoNome.trim()) {
      toast({ variant: 'destructive', title: 'Nome obrigatório' })
      return
    }
    setSalvando(true)
    try {
      const r = await fetch('/api/comissionamento/esquemas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novoNome, descricao: novaDescricao, status: novoStatus }),
      })
      const json = await r.json()
      if (!r.ok || json.error) {
        toast({ variant: 'destructive', title: 'Erro ao criar', description: json.error })
        return
      }
      toast({ title: 'Esquema criado', description: novoNome })
      setCriarOpen(false)
      await carregar()
    } finally {
      setSalvando(false)
    }
  }

  async function confirmarExcluir() {
    if (!excluindo) return
    const r = await fetch(`/api/comissionamento/esquemas/${excluindo.id}`, { method: 'DELETE' })
    const json = await r.json().catch(() => ({}))
    if (!r.ok || json.error) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: json.error })
      return
    }
    toast({ title: 'Esquema excluído', description: excluindo.nome })
    setExcluindo(null)
    await carregar()
  }

  // KPIs
  const stats = useMemo(() => {
    const total      = esquemas.length
    const ativos     = esquemas.filter(e => e.status === 'ativo').length
    const rascunhos  = esquemas.filter(e => e.status === 'rascunho').length
    const totalRegras = esquemas.reduce((s, e) => s + (e.qtd_regras ?? 0), 0)
    return { total, ativos, rascunhos, totalRegras }
  }, [esquemas])

  return (
    <div className="flex flex-col min-h-full">
      <Header
        title="Esquemas de Comissão"
        description="Esquemas contendo as regras de cálculo aplicáveis a um conjunto de membros"
        actions={
          <Link
            href="/comissionamento"
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-[12.5px]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Dashboard
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiPill titulo="Total"     valor={stats.total}        icone={ClipboardList} cor="purple" />
          <KpiPill titulo="Ativos"    valor={stats.ativos}       icone={CheckCircle2}  cor="emerald" />
          <KpiPill titulo="Rascunhos" valor={stats.rascunhos}    icone={Pencil}        cor="amber" />
          <KpiPill titulo="Regras"    valor={stats.totalRegras}  icone={FileText}      cor="indigo" />
        </div>

        {/* Filtros + botão */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <Input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Nome ou descrição..."
                  className="h-9 pl-8 text-[13px]"
                />
              </div>
            </div>

            <div className="min-w-[150px]">
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Status</Label>
              <Select value={statusFiltro} onValueChange={(v) => setStatusFiltro(v as 'todos' | EsquemaStatus)}>
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="ativo">Ativos</SelectItem>
                  <SelectItem value="rascunho">Rascunhos</SelectItem>
                  <SelectItem value="inativo">Inativos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={abrirCriar} className="h-9 gap-1.5 bg-gray-900 hover:bg-black text-white text-[13px]">
              <Plus className="w-3.5 h-3.5" />
              Novo esquema
            </Button>
          </div>
        </div>

        {/* Erro */}
        {erro && (
          <div className="flex items-start gap-2 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px]">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">Erro ao carregar</p>
              <p className="text-[12px] opacity-80">{erro}</p>
            </div>
            <button onClick={carregar} className="text-[12px] font-medium underline">Tentar novamente</button>
          </div>
        )}

        {/* Lista (cards) */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : filtrados.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center mb-3">
              <ClipboardList className="w-6 h-6 text-purple-500" />
            </div>
            <p className="text-[13px] font-medium text-gray-700">Nenhum esquema encontrado</p>
            <p className="text-[12px] text-gray-500 mt-1">
              {busca || statusFiltro !== 'todos'
                ? 'Tente ajustar os filtros.'
                : 'Crie o primeiro esquema para começar a organizar suas regras.'}
            </p>
            {(!busca && statusFiltro === 'todos') && (
              <Button onClick={abrirCriar} className="mt-4 gap-1.5 bg-gray-900 hover:bg-black text-white">
                <Plus className="w-3.5 h-3.5" />
                Criar primeiro esquema
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtrados.map(e => (
              <EsquemaCard
                key={e.id}
                esquema={e}
                onExcluir={() => setExcluindo(e)}
              />
            ))}
          </div>
        )}

      </div>

      {/* Diálogo criar */}
      <Dialog open={criarOpen} onOpenChange={setCriarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-orange-500" />
              Novo esquema
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Nome</Label>
              <Input
                value={novoNome}
                onChange={e => setNovoNome(e.target.value)}
                placeholder="Ex.: Comissão Combustível 2026"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Descrição</Label>
              <Textarea
                value={novaDescricao}
                onChange={e => setNovaDescricao(e.target.value)}
                placeholder="Como esse esquema é usado..."
                rows={3}
              />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Status inicial</Label>
              <Select value={novoStatus} onValueChange={(v) => setNovoStatus(v as EsquemaStatus)}>
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rascunho">Rascunho</SelectItem>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCriarOpen(false)} disabled={salvando}>Cancelar</Button>
            <Button onClick={confirmarCriar} disabled={salvando} className="gap-2 bg-gray-900 hover:bg-black text-white">
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Criar esquema
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar exclusão */}
      <Dialog open={!!excluindo} onOpenChange={(o) => !o && setExcluindo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="w-4 h-4" />
              Excluir esquema
            </DialogTitle>
          </DialogHeader>
          {excluindo && (
            <div className="py-2">
              <p className="text-[13.5px] text-gray-700">
                Excluir <strong>{excluindo.nome}</strong>?
              </p>
              <p className="text-[12px] text-gray-500 mt-1">
                Todas as {excluindo.qtd_regras ?? 0} regra(s) deste esquema serão excluídas também.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluindo(null)}>Cancelar</Button>
            <Button onClick={confirmarExcluir} className="bg-red-600 hover:bg-red-700 text-white gap-2">
              <Trash2 className="w-3.5 h-3.5" />
              Excluir definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Subcomponentes ─────────────────────────────────────────────────────────

function EsquemaCard({ esquema, onExcluir }: {
  esquema:    Esquema
  onExcluir:  () => void
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 hover:border-gray-300 transition-colors overflow-hidden flex flex-col">
      <div className="p-4 flex-1">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/comissionamento/esquemas/${esquema.id}`}
            className="flex-1 min-w-0"
          >
            <p className="text-[14px] font-bold text-gray-900 truncate group-hover:text-blue-700">{esquema.nome}</p>
            {esquema.descricao && (
              <p className="text-[12px] text-gray-500 mt-1 line-clamp-2">{esquema.descricao}</p>
            )}
          </Link>
          <Badge variant="outline" className={cn('text-[10.5px] flex-shrink-0', STATUS_CORES[esquema.status])}>
            {STATUS_LABELS[esquema.status]}
          </Badge>
        </div>

        <div className="mt-3 flex items-center gap-3 text-[11.5px] text-gray-500">
          <span className="inline-flex items-center gap-1">
            <FileText className="w-3 h-3" />
            {esquema.qtd_regras ?? 0} regra{(esquema.qtd_regras ?? 0) === 1 ? '' : 's'}
          </span>
          <span className="text-gray-300">·</span>
          <span className="inline-flex items-center gap-1 text-emerald-700">
            {esquema.qtd_ativas ?? 0} ativa{(esquema.qtd_ativas ?? 0) === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="border-t border-gray-100 px-4 py-2 flex items-center justify-between">
        <Link
          href={`/comissionamento/esquemas/${esquema.id}`}
          className="text-[12.5px] font-medium text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
        >
          Abrir
          <ChevronRight className="w-3 h-3" />
        </Link>
        <button
          onClick={onExcluir}
          className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          title="Excluir esquema"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

function KpiPill({ titulo, valor, icone: Icone, cor }: {
  titulo: string
  valor:  number
  icone:  React.ElementType
  cor:    'purple' | 'emerald' | 'amber' | 'indigo'
}) {
  const cores: Record<typeof cor, { bg: string; texto: string }> = {
    purple:  { bg: 'bg-purple-50',  texto: 'text-purple-700' },
    emerald: { bg: 'bg-emerald-50', texto: 'text-emerald-700' },
    amber:   { bg: 'bg-amber-50',   texto: 'text-amber-700' },
    indigo:  { bg: 'bg-indigo-50',  texto: 'text-indigo-700' },
  }
  const c = cores[cor]
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-3">
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', c.bg)}>
        <Icone className={cn('w-4 h-4', c.texto)} />
      </div>
      <div className="min-w-0">
        <p className="text-[10.5px] uppercase tracking-wide text-gray-500 font-medium">{titulo}</p>
        <p className="text-[17px] font-bold text-gray-900 tabular-nums leading-none mt-0.5">{valor}</p>
      </div>
    </div>
  )
}
