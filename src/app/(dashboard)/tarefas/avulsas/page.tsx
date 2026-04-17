'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { useAuthContext } from '@/contexts/AuthContext'
import { can } from '@/lib/utils/permissions'
import {
  Plus, Pencil, Trash2, Loader2, ClipboardList,
  AlertTriangle, CheckCircle2, Clock, XCircle,
  Filter, Search,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { Tarefa, StatusTarefa, PrioridadeTarefa, CategoriaTarefa, Role, Usuario } from '@/types/database.types'

// ─── Labels & cores ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<StatusTarefa, { label: string; icon: React.ElementType; className: string }> = {
  pendente:     { label: 'Pendente',     icon: Clock,         className: 'bg-gray-100 text-gray-700 border-gray-200' },
  em_andamento: { label: 'Em andamento', icon: AlertTriangle, className: 'bg-blue-100 text-blue-700 border-blue-200' },
  concluido:    { label: 'Concluído',    icon: CheckCircle2,  className: 'bg-green-100 text-green-700 border-green-200' },
  cancelado:    { label: 'Cancelado',    icon: XCircle,       className: 'bg-red-100 text-red-700 border-red-200' },
}

const PRIORIDADE_CONFIG: Record<PrioridadeTarefa, { label: string; className: string }> = {
  baixa:   { label: 'Baixa',   className: 'bg-slate-100 text-slate-600 border-slate-200' },
  media:   { label: 'Média',   className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  alta:    { label: 'Alta',    className: 'bg-orange-100 text-orange-700 border-orange-200' },
  urgente: { label: 'Urgente', className: 'bg-red-100 text-red-700 border-red-200' },
}

const CATEGORIA_LABELS: Partial<Record<CategoriaTarefa, string>> = {
  fechamento_caixa:    'Fechamento de Caixa',
  lancamento_notas:    'Lançamento de Notas',
  faturamento:         'Faturamento',
  apuracao_impostos:   'Apuração de Impostos',
  folha_pagamento:     'Folha de Pagamento',
  relatorio_gerencial: 'Relatório Gerencial',
  auditoria:           'Auditoria',
  outros:              'Outros',
}

const EMPTY_FORM = {
  titulo: '',
  descricao: '',
  status: 'pendente' as StatusTarefa,
  prioridade: 'media' as PrioridadeTarefa,
  categoria: '' as CategoriaTarefa | '',
  data_inicio: '',
  data_conclusao_prevista: '',
  observacoes: '',
  usuario_id: '',
}

function isOverdue(t: Tarefa): boolean {
  if (!t.data_conclusao_prevista) return false
  if (t.status === 'concluido' || t.status === 'cancelado') return false
  return new Date(t.data_conclusao_prevista) < new Date(new Date().toDateString())
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function TarefasAvulsasPage() {
  const { usuario } = useAuthContext()
  const supabase = createClient()
  const role = usuario?.role as Role | undefined
  const canDelete = can(role ?? null, 'tarefas.delete')
  const canEdit   = can(role ?? null, 'tarefas.edit')
  const canCreate = can(role ?? null, 'tarefas.create')
  const isMasterAdmin = role === 'master' || role === 'admin'

  const [tarefas,  setTarefas]  = useState<Tarefa[]>([])
  const [usuarios, setUsuarios] = useState<Pick<Usuario, 'id' | 'nome'>[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [openForm,   setOpenForm]   = useState(false)
  const [openDelete, setOpenDelete] = useState(false)
  const [selected,   setSelected]   = useState<Tarefa | null>(null)
  const [form,       setForm]       = useState(EMPTY_FORM)

  const [filterStatus,   setFilterStatus]   = useState<StatusTarefa | 'todos'>('todos')
  const [filterCategoria, setFilterCategoria] = useState<CategoriaTarefa | 'todos'>('todos')
  const [filterUsuario,  setFilterUsuario]  = useState('todos')
  const [search,         setSearch]         = useState('')

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('tarefas')
      .select('*, usuario:usuarios(id, nome, email), empresa:empresas(id, nome), posto:postos(id, nome)')
      .neq('categoria', 'conciliacao_bancaria')
      .order('data_inicio', { ascending: false })
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao carregar tarefas', description: error.message })
    } else {
      setTarefas((data ?? []) as Tarefa[])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    if (isMasterAdmin) {
      supabase.from('usuarios').select('id, nome').eq('ativo', true).order('nome')
        .then(({ data }) => { if (data) setUsuarios(data) })
    }
  }, [])

  const filtered = useMemo(() => {
    return tarefas.filter(t => {
      if (filterStatus    !== 'todos' && t.status   !== filterStatus)    return false
      if (filterCategoria !== 'todos' && t.categoria !== filterCategoria) return false
      if (filterUsuario   !== 'todos' && t.usuario_id !== filterUsuario)  return false
      if (search) {
        const q = search.toLowerCase()
        const inTitulo  = t.titulo.toLowerCase().includes(q)
        const inDesc    = (t.descricao ?? '').toLowerCase().includes(q)
        const inUsuario = (t.usuario as any)?.nome?.toLowerCase().includes(q) ?? false
        if (!inTitulo && !inDesc && !inUsuario) return false
      }
      return true
    })
  }, [tarefas, filterStatus, filterCategoria, filterUsuario, search])

  const resumo = useMemo(() => ({
    total:        tarefas.length,
    pendente:     tarefas.filter(t => t.status === 'pendente').length,
    em_andamento: tarefas.filter(t => t.status === 'em_andamento').length,
    concluido:    tarefas.filter(t => t.status === 'concluido').length,
    atrasadas:    tarefas.filter(isOverdue).length,
  }), [tarefas])

  function openCreate() {
    setSelected(null)
    setForm({ ...EMPTY_FORM, usuario_id: usuario?.id ?? '' })
    setOpenForm(true)
  }

  function openEdit(t: Tarefa) {
    setSelected(t)
    setForm({
      titulo:                  t.titulo,
      descricao:               t.descricao ?? '',
      status:                  t.status,
      prioridade:              t.prioridade,
      categoria:               t.categoria ?? '',
      data_inicio:             t.data_inicio ?? '',
      data_conclusao_prevista: t.data_conclusao_prevista ?? '',
      observacoes:             t.observacoes ?? '',
      usuario_id:              t.usuario_id,
    })
    setOpenForm(true)
  }

  async function handleSave() {
    if (!form.titulo.trim()) {
      toast({ variant: 'destructive', title: 'O título é obrigatório' })
      return
    }
    setSaving(true)
    const uid = form.usuario_id || (usuario?.id ?? '')
    const payload: Record<string, unknown> = {
      titulo:                  form.titulo.trim(),
      descricao:               form.descricao  || null,
      status:                  form.status,
      prioridade:              form.prioridade,
      categoria:               form.categoria  || null,
      data_inicio:             form.data_inicio || null,
      data_conclusao_prevista: form.data_conclusao_prevista || null,
      observacoes:             form.observacoes || null,
      usuario_id:              uid,
      data_conclusao_real:     form.status === 'concluido'
        ? (selected?.data_conclusao_real ?? new Date().toISOString())
        : null,
    }
    if (!selected) payload.empresa_id = usuario?.empresa_id ?? null

    const { error } = selected
      ? await supabase.from('tarefas').update(payload).eq('id', selected.id)
      : await supabase.from('tarefas').insert(payload)

    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message })
    } else {
      toast({ title: selected ? 'Tarefa atualizada!' : 'Tarefa criada!' })
      setOpenForm(false)
      load()
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    const { error } = await supabase.from('tarefas').delete().eq('id', selected.id)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: error.message })
    } else {
      toast({ title: 'Tarefa excluída!' })
      setOpenDelete(false)
      load()
    }
    setDeleting(false)
  }

  async function handleStatusChange(t: Tarefa, newStatus: StatusTarefa) {
    const extra: Record<string, unknown> = {}
    if (newStatus === 'concluido' && !t.data_conclusao_real) {
      extra.data_conclusao_real = new Date().toISOString()
    } else if (newStatus !== 'concluido') {
      extra.data_conclusao_real = null
    }
    const { error } = await supabase.from('tarefas').update({ status: newStatus, ...extra }).eq('id', t.id)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao atualizar status', description: error.message })
    } else {
      load()
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <Header
        title="Tarefas Avulsas"
        description="Tarefas rotineiras e pontuais da equipe"
        actions={
          canCreate && (
            <Button onClick={openCreate} className="h-9 bg-orange-500 hover:bg-orange-600 text-[13px] gap-1.5">
              <Plus className="w-4 h-4" />
              Nova Tarefa
            </Button>
          )
        }
      />

      <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4">

        {/* Cards resumo */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {[
            { label: 'Total',        value: resumo.total,        color: 'text-gray-700',  bg: 'bg-white border-gray-200' },
            { label: 'Pendentes',    value: resumo.pendente,     color: 'text-gray-600',  bg: 'bg-white border-gray-200' },
            { label: 'Em andamento', value: resumo.em_andamento, color: 'text-blue-700',  bg: 'bg-blue-50 border-blue-200' },
            { label: 'Concluídas',   value: resumo.concluido,    color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
            { label: 'Atrasadas',    value: resumo.atrasadas,    color: 'text-red-700',   bg: 'bg-red-50 border-red-200' },
          ].map(c => (
            <div key={c.label} className={cn('rounded-xl border px-4 py-3 shadow-sm', c.bg)}>
              <p className="text-[11px] text-gray-500">{c.label}</p>
              <p className={cn('text-2xl font-bold', c.color)}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex flex-col gap-3">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por título ou responsável..."
              className="w-full h-9 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-0.5">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Status</label>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as StatusTarefa | 'todos')}
                className="w-full h-9 px-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-orange-400">
                <option value="todos">Todos</option>
                <option value="pendente">Pendente</option>
                <option value="em_andamento">Em andamento</option>
                <option value="concluido">Concluído</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>

            <div className="space-y-0.5">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Categoria</label>
              <select value={filterCategoria} onChange={e => setFilterCategoria(e.target.value as CategoriaTarefa | 'todos')}
                className="w-full h-9 px-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-orange-400">
                <option value="todos">Todas</option>
                {Object.entries(CATEGORIA_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            {isMasterAdmin && (
              <div className="space-y-0.5 col-span-2">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Responsável</label>
                <select value={filterUsuario} onChange={e => setFilterUsuario(e.target.value)}
                  className="w-full h-9 px-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-orange-400">
                  <option value="todos">Todos</option>
                  {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Tabela */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-[13px]">Carregando...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
              <ClipboardList className="w-10 h-10 opacity-20" />
              <p className="text-[13px]">Nenhuma tarefa encontrada.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-[11px]">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Título</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Categoria</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Responsável</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Início</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Prazo</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Prioridade</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => {
                  const scfg    = STATUS_CONFIG[t.status]
                  const pcfg    = PRIORIDADE_CONFIG[t.prioridade]
                  const SIcon   = scfg.icon
                  const overdue = isOverdue(t)

                  return (
                    <tr
                      key={t.id}
                      className={cn(
                        'border-b border-gray-100 last:border-0 hover:bg-gray-50/40 transition-colors',
                        overdue ? 'bg-red-50/30' : i % 2 !== 0 ? 'bg-gray-50/20' : '',
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-gray-800 leading-tight">{t.titulo}</p>
                        {t.descricao && (
                          <p className="text-[11px] text-gray-400 truncate max-w-[260px]">{t.descricao}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-[11px]">
                        {t.categoria ? (CATEGORIA_LABELS[t.categoria as keyof typeof CATEGORIA_LABELS] ?? t.categoria) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {(t.usuario as any)?.nome ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                        {formatDate(t.data_inicio)}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={cn(overdue ? 'text-red-600 font-semibold' : 'text-gray-500')}>
                          {formatDate(t.data_conclusao_prevista)}
                          {overdue && ' ⚠'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10.5px] font-semibold border', pcfg.className)}>
                          {pcfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {canEdit ? (
                          <select
                            value={t.status}
                            onChange={e => handleStatusChange(t, e.target.value as StatusTarefa)}
                            className={cn(
                              'text-[11px] font-semibold border rounded-full px-2 py-0.5 cursor-pointer focus:outline-none',
                              scfg.className,
                            )}
                          >
                            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                              <option key={k} value={k}>{v.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border', scfg.className)}>
                            <SIcon className="w-3 h-3" />
                            {scfg.label}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1 justify-end">
                          {canEdit && (
                            <button onClick={() => openEdit(t)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => { setSelected(t); setOpenDelete(true) }}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal Form ── */}
      <Dialog open={openForm} onOpenChange={o => { if (!saving) setOpenForm(o) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected ? 'Editar Tarefa' : 'Nova Tarefa'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-[12px]">Título *</Label>
              <Input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                placeholder="Descreva a tarefa..." className="h-9 text-[13px]" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px]">Descrição</Label>
              <Textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder="Detalhes adicionais..." className="text-[13px] resize-none h-20" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px]">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as StatusTarefa }))}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[12px]">Prioridade</Label>
                <Select value={form.prioridade} onValueChange={v => setForm(f => ({ ...f, prioridade: v as PrioridadeTarefa }))}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORIDADE_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px]">Categoria</Label>
              <Select value={form.categoria || '_none'} onValueChange={v => setForm(f => ({ ...f, categoria: v === '_none' ? '' : v as CategoriaTarefa }))}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Sem categoria</SelectItem>
                  {Object.entries(CATEGORIA_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px]">Data de início</Label>
                <Input type="date" value={form.data_inicio} onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))}
                  className="h-9 text-[13px]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px]">Prazo</Label>
                <Input type="date" value={form.data_conclusao_prevista} onChange={e => setForm(f => ({ ...f, data_conclusao_prevista: e.target.value }))}
                  className="h-9 text-[13px]" />
              </div>
            </div>

            {isMasterAdmin && (
              <div className="space-y-1.5">
                <Label className="text-[12px]">Responsável</Label>
                <Select value={form.usuario_id || '_none'} onValueChange={v => setForm(f => ({ ...f, usuario_id: v === '_none' ? '' : v }))}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Sem responsável</SelectItem>
                    {usuarios.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-[12px]">Observações</Label>
              <Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                placeholder="Anotações internas..." className="text-[13px] resize-none h-16" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenForm(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-orange-500 hover:bg-orange-600 min-w-[100px]">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : selected ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm Delete ── */}
      <ConfirmDialog
        open={openDelete}
        onOpenChange={setOpenDelete}
        title="Excluir tarefa"
        description={`Deseja excluir "${selected?.titulo}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  )
}
