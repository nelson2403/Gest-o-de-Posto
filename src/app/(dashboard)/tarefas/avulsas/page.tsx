'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { useAuthContext } from '@/contexts/AuthContext'
import { can } from '@/lib/utils/permissions'
import {
  Plus, Pencil, Trash2, Loader2, ClipboardList,
  AlertTriangle, CheckCircle2, Clock, XCircle,
  Search, MapPin, User2, Calendar, Tag, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { Tarefa, StatusTarefa, PrioridadeTarefa, CategoriaTarefa, Role, Usuario } from '@/types/database.types'

// ─── Config ────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<StatusTarefa, { label: string; icon: React.ElementType; card: string; badge: string }> = {
  pendente:     { label: 'Pendente',     icon: Clock,         card: 'border-l-gray-300  bg-white',        badge: 'bg-gray-100 text-gray-700 border-gray-200'   },
  em_andamento: { label: 'Em andamento', icon: AlertTriangle, card: 'border-l-blue-400  bg-blue-50/30',   badge: 'bg-blue-100 text-blue-700 border-blue-200'   },
  concluido:    { label: 'Concluído',    icon: CheckCircle2,  card: 'border-l-green-400 bg-green-50/20',  badge: 'bg-green-100 text-green-700 border-green-200' },
  cancelado:    { label: 'Cancelado',    icon: XCircle,       card: 'border-l-red-300   bg-red-50/10',    badge: 'bg-red-100 text-red-600 border-red-200'       },
}

const PRIORIDADE_CONFIG: Record<PrioridadeTarefa, { label: string; badge: string; dot: string }> = {
  baixa:   { label: 'Baixa',   badge: 'bg-slate-100 text-slate-600 border-slate-200',    dot: 'bg-slate-400'  },
  media:   { label: 'Média',   badge: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-400' },
  alta:    { label: 'Alta',    badge: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  urgente: { label: 'Urgente', badge: 'bg-red-100 text-red-700 border-red-200',          dot: 'bg-red-500'    },
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
  titulo: '', descricao: '',
  status: 'pendente' as StatusTarefa,
  prioridade: 'media' as PrioridadeTarefa,
  categoria: '' as CategoriaTarefa | '',
  data_inicio: '', data_conclusao_prevista: '',
  observacoes: '', usuario_id: '', posto_id: '',
}

function isOverdue(t: Tarefa): boolean {
  if (!t.data_conclusao_prevista) return false
  if (t.status === 'concluido' || t.status === 'cancelado') return false
  return new Date(t.data_conclusao_prevista) < new Date(new Date().toDateString())
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// ─── Página ───────────────────────────────────────────────────────────────────

interface PostoOpt { id: string; nome: string }

export default function TarefasAvulsasPage() {
  const { usuario } = useAuthContext()
  const supabase    = createClient()
  const role        = usuario?.role as Role | undefined
  const canDelete   = can(role ?? null, 'tarefas.delete')
  const canEdit     = can(role ?? null, 'tarefas.edit')
  const canCreate   = can(role ?? null, 'tarefas.create')
  const isMasterAdmin = role === 'master'
  const isGerente     = role === 'gerente'
  const postoGerente  = usuario?.posto_fechamento_id ?? null

  const [tarefas,   setTarefas]   = useState<Tarefa[]>([])
  const [usuarios,  setUsuarios]  = useState<Pick<Usuario, 'id' | 'nome'>[]>([])
  const [postos,    setPostos]    = useState<PostoOpt[]>([])
  const [empresaId, setEmpresaId] = useState<string | null>(usuario?.empresa_id ?? null)
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [deleting,  setDeleting]  = useState(false)

  const [openForm,   setOpenForm]   = useState(false)
  const [openDelete, setOpenDelete] = useState(false)
  const [selected,   setSelected]   = useState<Tarefa | null>(null)
  const [form,       setForm]       = useState(EMPTY_FORM)

  const [filterStatus,    setFilterStatus]    = useState<StatusTarefa | 'todos'>('todos')
  const [filterPrioridade,setFilterPrioridade]= useState<PrioridadeTarefa | 'todos'>('todos')
  const [filterPosto,     setFilterPosto]     = useState('todos')
  const [search,          setSearch]          = useState('')

  async function load() {
    setLoading(true)
    let query = supabase
      .from('tarefas')
      .select('*, usuario:usuarios(id, nome), empresa:empresas(id, nome), posto:postos(id, nome)')
      .or('categoria.neq.conciliacao_bancaria,categoria.is.null')
      .order('data_conclusao_prevista', { ascending: true, nullsFirst: false })
    // Gerente vê apenas as próprias tarefas (gestor pessoal)
    if (isGerente && usuario?.id) {
      query = query.eq('usuario_id', usuario.id)
    }
    const { data, error } = await query
    if (error) toast({ variant: 'destructive', title: 'Erro ao carregar', description: error.message })
    else setTarefas((data ?? []) as Tarefa[])
    setLoading(false)
  }

  useEffect(() => {
    if (!usuario) return  // aguarda auth carregar antes de buscar
    load()
    supabase.from('postos').select('id, nome').order('nome')
      .then(({ data }) => { if (data) setPostos(data) })
    if (isMasterAdmin) {
      supabase.from('usuarios').select('id, nome').eq('ativo', true).order('nome')
        .then(({ data }) => { if (data) setUsuarios(data) })
    }
    if (!usuario.empresa_id) {
      supabase.from('empresas').select('id').limit(1).single()
        .then(({ data }) => { if (data) setEmpresaId(data.id) })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.id])

  const filtered = useMemo(() => tarefas.filter(t => {
    if (filterStatus     !== 'todos' && t.status    !== filterStatus)     return false
    if (filterPrioridade !== 'todos' && t.prioridade !== filterPrioridade) return false
    if (filterPosto      !== 'todos' && (t as any).posto_id !== filterPosto) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !t.titulo.toLowerCase().includes(q) &&
        !(t.descricao ?? '').toLowerCase().includes(q) &&
        !((t.usuario as any)?.nome ?? '').toLowerCase().includes(q)
      ) return false
    }
    return true
  }), [tarefas, filterStatus, filterPrioridade, filterPosto, search])

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

  function openEditTarefa(t: Tarefa) {
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
      posto_id:                (t as any).posto_id ?? '',
    })
    setOpenForm(true)
  }

  async function handleSave() {
    if (!form.titulo.trim()) { toast({ variant: 'destructive', title: 'Título é obrigatório' }); return }
    setSaving(true)
    const payload: Record<string, unknown> = {
      titulo:                  form.titulo.trim(),
      descricao:               form.descricao || null,
      status:                  form.status,
      prioridade:              form.prioridade,
      categoria:               form.categoria || null,
      data_inicio:             form.data_inicio || null,
      data_conclusao_prevista: form.data_conclusao_prevista || null,
      observacoes:             form.observacoes || null,
      usuario_id:              form.usuario_id || (usuario?.id ?? ''),
      posto_id:                form.posto_id || null,
      data_conclusao_real:     form.status === 'concluido'
        ? (selected?.data_conclusao_real ?? new Date().toISOString()) : null,
    }
    if (!selected) payload.empresa_id = empresaId

    const { error } = selected
      ? await supabase.from('tarefas').update(payload).eq('id', selected.id)
      : await supabase.from('tarefas').insert(payload)

    if (error) toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message })
    else { toast({ title: selected ? 'Tarefa atualizada!' : 'Tarefa criada!' }); setOpenForm(false); load() }
    setSaving(false)
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    const { error } = await supabase.from('tarefas').delete().eq('id', selected.id)
    if (error) toast({ variant: 'destructive', title: 'Erro ao excluir', description: error.message })
    else { toast({ title: 'Tarefa excluída!' }); setOpenDelete(false); load() }
    setDeleting(false)
  }

  async function handleStatusChange(t: Tarefa, newStatus: StatusTarefa) {
    const extra: Record<string, unknown> = {}
    if (newStatus === 'concluido' && !t.data_conclusao_real) extra.data_conclusao_real = new Date().toISOString()
    else if (newStatus !== 'concluido') extra.data_conclusao_real = null
    const { error } = await supabase.from('tarefas').update({ status: newStatus, ...extra }).eq('id', t.id)
    if (error) toast({ variant: 'destructive', title: 'Erro', description: error.message })
    else load()
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="Tarefas"
        description="Tarefas rotineiras e pontuais da equipe"
        actions={canCreate && (
          <Button onClick={openCreate} className="h-9 bg-[#8B1A14] hover:bg-[#711510] text-[13px] gap-1.5">
            <Plus className="w-4 h-4" /> Nova Tarefa
          </Button>
        )}
      />

      <div className="p-3 md:p-6 space-y-5">

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total',        value: resumo.total,        icon: ClipboardList, color: 'bg-[#8B1A14]' },
            { label: 'Pendentes',    value: resumo.pendente,     icon: Clock,         color: 'bg-gray-500' },
            { label: 'Em andamento', value: resumo.em_andamento, icon: AlertTriangle, color: 'bg-blue-500' },
            { label: 'Concluídas',   value: resumo.concluido,    icon: CheckCircle2,  color: 'bg-emerald-500' },
            { label: 'Atrasadas',    value: resumo.atrasadas,    icon: XCircle,       color: 'bg-red-500' },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', c.color)}>
                <c.icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{c.label}</p>
                <p className="text-[24px] font-bold text-gray-900 leading-tight">{c.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Filtros ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por título, descrição ou responsável..."
              className="pl-9 h-9 text-[13px]" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1 block">Status</label>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as StatusTarefa | 'todos')}
                className="w-full h-9 px-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#8B1A14]">
                <option value="todos">Todos</option>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1 block">Prioridade</label>
              <select value={filterPrioridade} onChange={e => setFilterPrioridade(e.target.value as PrioridadeTarefa | 'todos')}
                className="w-full h-9 px-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#8B1A14]">
                <option value="todos">Todas</option>
                {Object.entries(PRIORIDADE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            {!isGerente && (
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1 block">Posto</label>
              <select value={filterPosto} onChange={e => setFilterPosto(e.target.value)}
                className="w-full h-9 px-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#8B1A14]">
                <option value="todos">Todos</option>
                {postos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            )}
            {isMasterAdmin && (
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1 block">Responsável</label>
                <select value={''} onChange={() => {}}
                  className="w-full h-9 px-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#8B1A14]">
                  <option value="">Todos</option>
                  {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* ── Cards de tarefas ── */}
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-[13px]">Carregando...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
            <ClipboardList className="w-12 h-12 opacity-20" />
            <p className="text-[14px] font-medium">Nenhuma tarefa encontrada</p>
            {canCreate && (
              <Button variant="outline" size="sm" onClick={openCreate} className="gap-1.5 text-[12px] mt-1">
                <Plus className="w-3.5 h-3.5" /> Criar primeira tarefa
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map(t => {
              const sc     = STATUS_CONFIG[t.status]
              const pc     = PRIORIDADE_CONFIG[t.prioridade]
              const SIcon  = sc.icon
              const overdue = isOverdue(t)
              const postoNome = (t as any).posto?.nome as string | undefined

              return (
                <div key={t.id} className={cn(
                  'bg-white rounded-2xl border border-gray-100 shadow-sm border-l-4 p-4 flex flex-col gap-3 transition-all hover:shadow-md',
                  sc.card,
                  overdue && 'ring-1 ring-red-300'
                )}>
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        {overdue && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
                            <AlertTriangle className="w-3 h-3" /> Atrasada
                          </span>
                        )}
                        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border', pc.badge)}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', pc.dot)} />
                          {pc.label}
                        </span>
                        {t.categoria && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
                            <Tag className="w-3 h-3" />
                            {CATEGORIA_LABELS[t.categoria as keyof typeof CATEGORIA_LABELS] ?? t.categoria}
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-[14px] text-gray-900 leading-snug">{t.titulo}</h3>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {canEdit && (
                        <button onClick={() => openEditTarefa(t)}
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
                  </div>

                  {/* Descrição — destaque principal */}
                  {t.descricao && (
                    <div className="bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
                      <p className="text-[12.5px] text-gray-700 leading-relaxed whitespace-pre-line">{t.descricao}</p>
                    </div>
                  )}

                  {/* Observações */}
                  {t.observacoes && (
                    <p className="text-[11.5px] text-gray-400 italic px-1">{t.observacoes}</p>
                  )}

                  {/* Meta */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] text-gray-500">
                    {postoNome && (
                      <span className="flex items-center gap-1 font-medium text-[#8B1A14]">
                        <MapPin className="w-3.5 h-3.5" /> {postoNome}
                      </span>
                    )}
                    {(t.usuario as any)?.nome && (
                      <span className="flex items-center gap-1">
                        <User2 className="w-3.5 h-3.5" /> {(t.usuario as any).nome}
                      </span>
                    )}
                    {t.data_conclusao_prevista && (
                      <span className={cn('flex items-center gap-1', overdue && 'text-red-600 font-semibold')}>
                        <Calendar className="w-3.5 h-3.5" /> Prazo: {fmtDate(t.data_conclusao_prevista)}
                      </span>
                    )}
                  </div>

                  {/* Status dropdown */}
                  <div className="pt-1 border-t border-gray-100">
                    {canEdit ? (
                      <select value={t.status} onChange={e => handleStatusChange(t, e.target.value as StatusTarefa)}
                        className={cn(
                          'text-[11px] font-semibold border rounded-full px-3 py-1 cursor-pointer focus:outline-none w-full',
                          sc.badge
                        )}>
                        {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={cn('inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold border', sc.badge)}>
                        <SIcon className="w-3 h-3" /> {sc.label}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      <Dialog open={openForm} onOpenChange={o => { if (!saving) setOpenForm(o) }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
                placeholder="Detalhes da tarefa — será exibida em destaque no card..."
                className="text-[13px] resize-none h-24" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px]">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as StatusTarefa }))}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px]">Prioridade</Label>
                <Select value={form.prioridade} onValueChange={v => setForm(f => ({ ...f, prioridade: v as PrioridadeTarefa }))}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORIDADE_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
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
                  {Object.entries(CATEGORIA_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px]">Posto (opcional)</Label>
              <Select value={form.posto_id || '_none'} onValueChange={v => setForm(f => ({ ...f, posto_id: v === '_none' ? '' : v }))}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="Selecione um posto..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Sem posto vinculado</SelectItem>
                  {postos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px]">Data de início</Label>
                <Input type="date" value={form.data_inicio} onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))} className="h-9 text-[13px]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px]">Prazo</Label>
                <Input type="date" value={form.data_conclusao_prevista} onChange={e => setForm(f => ({ ...f, data_conclusao_prevista: e.target.value }))} className="h-9 text-[13px]" />
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
              <Label className="text-[12px]">Observações internas</Label>
              <Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                placeholder="Anotações internas..." className="text-[13px] resize-none h-16" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenForm(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#8B1A14] hover:bg-[#711510] min-w-[100px]">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : selected ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={openDelete} onOpenChange={setOpenDelete}
        title="Excluir tarefa"
        description={`Deseja excluir "${selected?.titulo}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir" variant="destructive"
        loading={deleting} onConfirm={handleDelete}
      />
    </div>
  )
}
