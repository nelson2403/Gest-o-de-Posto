'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
  Plus, Pencil, Trash2, Loader2, ClipboardList, Eye,
  AlertTriangle, CheckCircle2, Clock, XCircle, ChevronDown,
  Calendar, User2, Tag, Filter, MessageSquare, CalendarPlus,
  Upload, FileSpreadsheet, TrendingUp, TrendingDown, Minus, MapPin,
  Landmark,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { Tarefa, StatusTarefa, PrioridadeTarefa, CategoriaTarefa, Role, Usuario } from '@/types/database.types'

// ─── Labels & cores ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<StatusTarefa, { label: string; icon: React.ElementType; className: string }> = {
  pendente:     { label: 'Pendente',    icon: Clock,         className: 'bg-gray-100 text-gray-700 border-gray-200' },
  em_andamento: { label: 'Em andamento', icon: AlertTriangle, className: 'bg-blue-100 text-blue-700 border-blue-200' },
  concluido:    { label: 'Concluído',   icon: CheckCircle2,  className: 'bg-green-100 text-green-700 border-green-200' },
  cancelado:    { label: 'Cancelado',   icon: XCircle,       className: 'bg-red-100 text-red-700 border-red-200' },
}

const PRIORIDADE_CONFIG: Record<PrioridadeTarefa, { label: string; className: string }> = {
  baixa:   { label: 'Baixa',   className: 'bg-slate-100 text-slate-600 border-slate-200' },
  media:   { label: 'Média',   className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  alta:    { label: 'Alta',    className: 'bg-orange-100 text-orange-700 border-orange-200' },
  urgente: { label: 'Urgente', className: 'bg-red-100 text-red-700 border-red-200' },
}

const CATEGORIA_LABELS: Record<CategoriaTarefa, string> = {
  fechamento_caixa:    'Fechamento de Caixa',
  lancamento_notas:    'Lançamento de Notas',
  faturamento:         'Faturamento',
  conciliacao_bancaria: 'Conciliação Bancária',
  apuracao_impostos:   'Apuração de Impostos',
  folha_pagamento:     'Folha de Pagamento',
  relatorio_gerencial: 'Relatório Gerencial',
  auditoria:           'Auditoria',
  outros:              'Outros',
}

// ─── Form state ────────────────────────────────────────────────────────────────

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

// ─── Helper ────────────────────────────────────────────────────────────────────

function isOverdue(tarefa: Tarefa): boolean {
  if (!tarefa.data_conclusao_prevista) return false
  if (tarefa.status === 'concluido' || tarefa.status === 'cancelado') return false
  return new Date(tarefa.data_conclusao_prevista) < new Date(new Date().toDateString())
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// ─── Componentes auxiliares ────────────────────────────────────────────────────

function StatusBadgeInline({ status }: { status: StatusTarefa }) {
  const cfg = STATUS_CONFIG[status]
  const Icon = cfg.icon
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border',
      cfg.className,
    )}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  )
}

function PrioridadeBadge({ prioridade }: { prioridade: PrioridadeTarefa }) {
  const cfg = PRIORIDADE_CONFIG[prioridade]
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border',
      cfg.className,
    )}>
      {cfg.label}
    </span>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function TarefasPage() {
  const { usuario } = useAuthContext()
  const supabase = createClient()
  const role = usuario?.role as Role | undefined
  const isOperador     = role === 'operador'
  const isConciliador  = role === 'conciliador'
  const isRestrito     = isOperador || isConciliador   // comportamento de dashboard
  const isMaster       = role === 'master'
  const canDelete      = can(role ?? null, 'tarefas.delete')
  const canEdit        = can(role ?? null, 'tarefas.edit')
  const canCreate      = can(role ?? null, 'tarefas.create')

  // ── State ─────────────────────────────────���────────────────────────
  const [tarefas,  setTarefas]  = useState<Tarefa[]>([])
  const [usuarios, setUsuarios] = useState<Pick<Usuario, 'id' | 'nome'>[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [ultimoCaixaByPostoId, setUltimoCaixaByPostoId] = useState<Record<string, string | null>>({})

  const [openForm,    setOpenForm]    = useState(false)
  const [openView,    setOpenView]    = useState(false)
  const [openDelete,  setOpenDelete]  = useState(false)
  const [selected,    setSelected]    = useState<Tarefa | null>(null)
  const [form,        setForm]        = useState(EMPTY_FORM)

  // Gerar próximo dia (conciliador)
  const [gerandoDia, setGerandoDia] = useState(false)

  // Gerar dia especial (feriado com expediente bancário) — master/admin
  const [openDiaEspecial,  setOpenDiaEspecial]  = useState(false)
  const [diaEspecialData,  setDiaEspecialData]  = useState('')
  const [diaEspecialDesc,  setDiaEspecialDesc]  = useState('')
  const [gerandoEspecial,  setGerandoEspecial]  = useState(false)

  async function handleGerarDiaEspecial() {
    if (!diaEspecialData) {
      toast({ variant: 'destructive', title: 'Selecione uma data' })
      return
    }
    setGerandoEspecial(true)
    const { data, error } = await supabase.rpc('gerar_tarefas_dia_especial', { p_data: diaEspecialData })
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao gerar tarefas', description: error.message })
    } else {
      const qtd = data as number
      const [y, m, d] = diaEspecialData.split('-')
      const dataFmt = `${d}/${m}/${y}`
      toast({
        title: qtd === 0
          ? `Tarefas de ${dataFmt} já existem`
          : `${qtd} tarefa${qtd !== 1 ? 's' : ''} gerada${qtd !== 1 ? 's' : ''} para ${dataFmt}!`,
        description: qtd === 0
          ? 'Nenhuma tarefa nova criada — todas já existiam.'
          : diaEspecialDesc ? `Motivo: ${diaEspecialDesc}` : 'Tarefas criadas com sucesso.',
      })
      setOpenDiaEspecial(false)
      setDiaEspecialData('')
      setDiaEspecialDesc('')
      load()
    }
    setGerandoEspecial(false)
  }

  async function handleGerarProximoDia() {
    setGerandoDia(true)
    const { data, error } = await supabase.rpc('gerar_tarefas_proximo_dia')
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao gerar tarefas', description: error.message })
    } else {
      const qtd = data as number
      if (qtd === 0) {
        toast({ title: 'Nenhuma tarefa nova', description: 'Todas as tarefas do próximo dia já existem ou a data seria futura.' })
      } else {
        toast({ title: `${qtd} tarefa${qtd !== 1 ? 's' : ''} gerada${qtd !== 1 ? 's' : ''}!`, description: 'Tarefas do próximo dia adicionadas com sucesso.' })
      }
      load()
    }
    setGerandoDia(false)
  }

  // Modal de justificativa de atraso (conciliador)
  const [openJustify,   setOpenJustify]   = useState(false)
  const [justifyTarget, setJustifyTarget] = useState<Tarefa | null>(null)
  const [justifyText,   setJustifyText]   = useState('')
  const [savingJustify, setSavingJustify] = useState(false)

  // Extrato bancário
  const [uploadingExtrato, setUploadingExtrato] = useState(false)
  const [uploadingExtratoId, setUploadingExtratoId] = useState<string | null>(null)
  // Extrato multi-dias: posto_id em processamento
  const [uploadingMultiPostoId, setUploadingMultiPostoId] = useState<string | null>(null)
  // Modal de resultado multi-dias
  const [multiResultado, setMultiResultado] = useState<{
    postoNome: string; range: string
    resultados: Array<{ data: string; status: string; movimentoExtrato: number; movimentoAS: number; diferenca: number }>
  } | null>(null)
  // Modal de resultado extrato único
  const [extratoResultado, setExtratoResultado] = useState<{
    status: 'ok' | 'divergente'; data: string
    saldoAnterior: number; saldoDia: number; movimentoExtrato: number
    entradasAS: number | null; saidasAS: number | null; movimentoExterno: number
    contaCodigo: string | null; diferenca: number; asAcessivel: boolean
  } | null>(null)

  // Filtros
  const [filterStatus,     setFilterStatus]     = useState<StatusTarefa | 'todos'>('todos')
  const [filterPrioridade, setFilterPrioridade] = useState<PrioridadeTarefa | 'todos'>('todos')
  const [search,           setSearch]           = useState('')

  // ── Load ───────────────────────────────────────────────────────────
  async function load() {
    setLoading(true)

    // Conciliador: dispara geração automática antes de carregar
    if (isConciliador) {
      await supabase.rpc('gerar_tarefas_conciliacao')
    }

    // Busca postos do usuário via tarefas_recorrentes
    const uid = usuario?.id
    if (!uid) { setLoading(false); return }

    const { data: recorrentes } = await supabase
      .from('tarefas_recorrentes')
      .select('posto_id')
      .eq('usuario_id', uid)
      .eq('ativo', true)
      .not('posto_id', 'is', null)

    const postosIds = [...new Set((recorrentes ?? []).map(r => r.posto_id as string).filter(Boolean))]

    let q = supabase
      .from('tarefas')
      .select('*, usuario:usuarios(id, nome, email), empresa:empresas(id, nome), posto:postos(id, nome), recorrente:tarefas_recorrentes(posto_id, posto:postos(id, nome))')
      .eq('categoria', 'conciliacao_bancaria')
      .order('data_inicio', { ascending: false })

    // Filtra pelos postos do usuário (se tiver postos configurados)
    if (postosIds.length > 0) {
      q = q.in('posto_id', postosIds)
    }

    const [{ data, error }, postosRes, caixaRes] = await Promise.all([
      q,
      supabase.from('postos').select('id, codigo_empresa_externo').not('codigo_empresa_externo', 'is', null),
      fetch('/api/caixa-externo'),
    ])
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao carregar tarefas', description: error.message })
    } else {
      setTarefas((data ?? []) as Tarefa[])
    }
    // Monta mapa postoId → ultimo_caixa_fechado
    try {
      const caixaJson = await caixaRes.json()
      const caixaRows: { grid: string; ultimo_caixa_fechado: string | null }[] = caixaJson.data ?? []
      const codigoToData: Record<string, string | null> = {}
      for (const c of caixaRows) codigoToData[c.grid] = c.ultimo_caixa_fechado
      const map: Record<string, string | null> = {}
      for (const p of postosRes.data ?? []) {
        if (p.codigo_empresa_externo) map[p.id] = codigoToData[p.codigo_empresa_externo] ?? null
      }
      setUltimoCaixaByPostoId(map)
    } catch { /* caixa-externo inacessível — ignora */ }
    setLoading(false)
  }

  useEffect(() => {
    if (!usuario?.id) return
    load()
    // Carrega usuários para o form (atribuição de responsável)
    supabase
      .from('usuarios')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => { if (data) setUsuarios(data) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.id])

  // ── Dados filtrados ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return tarefas.filter(t => {
      if (filterStatus     !== 'todos' && t.status    !== filterStatus)    return false
      if (filterPrioridade !== 'todos' && t.prioridade !== filterPrioridade) return false
      if (search) {
        const q = search.toLowerCase()
        const inTitulo    = t.titulo.toLowerCase().includes(q)
        const inDescricao = (t.descricao ?? '').toLowerCase().includes(q)
        const inObs       = (t.observacoes ?? '').toLowerCase().includes(q)
        const inUsuario   = (t.usuario as any)?.nome?.toLowerCase().includes(q) ?? false
        if (!inTitulo && !inDescricao && !inObs && !inUsuario) return false
      }
      return true
    })
  }, [tarefas, filterStatus, filterPrioridade, search])

  // ── Accordion: postos expandidos ──────────────────────────────────
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  function togglePosto(postoId: string) {
    setExpandidos(prev => {
      const next = new Set(prev)
      next.has(postoId) ? next.delete(postoId) : next.add(postoId)
      return next
    })
  }

  // ── Agrupamento por posto ──────────────────────────────────────────
  const grupos = useMemo(() => {
    const map = new Map<string, { postoNome: string; items: Tarefa[] }>()
    for (const t of filtered) {
      // Resolve posto: direto na tarefa → via recorrente → fallback
      const recorrente = (t as any).recorrente as { posto_id: string | null; posto: { id: string; nome: string } | null } | null
      const postoId   = (t as any).posto_id ?? recorrente?.posto_id ?? 'sem-posto'
      const postoNome = (t as any).posto?.nome ?? recorrente?.posto?.nome ?? 'Sem Posto'
      if (!map.has(postoId)) map.set(postoId, { postoNome, items: [] })
      map.get(postoId)!.items.push(t)
    }
    return Array.from(map.entries())
      .map(([postoId, val]) => ({ postoId, ...val }))
      // Ordena: mais atrasadas primeiro, depois alfabético
      .sort((a, b) => {
        const atA = a.items.filter(isOverdue).length
        const atB = b.items.filter(isOverdue).length
        if (atB !== atA) return atB - atA
        return a.postoNome.localeCompare(b.postoNome)
      })
  }, [filtered])

  // ── Resumo ─────────────────────────────────────────────────────────
  const resumo = useMemo(() => ({
    total:       tarefas.length,
    pendente:    tarefas.filter(t => t.status === 'pendente').length,
    em_andamento: tarefas.filter(t => t.status === 'em_andamento').length,
    concluido:   tarefas.filter(t => t.status === 'concluido').length,
    atrasadas:   tarefas.filter(isOverdue).length,
  }), [tarefas])

  // ── CRUD ───────────────────────────────────────────────────────────
  function openCreate() {
    setSelected(null)
    setForm({
      ...EMPTY_FORM,
      usuario_id: isOperador ? (usuario?.id ?? '') : '',
    })
    setOpenForm(true)
  }

  function openEditTarefa(t: Tarefa) {
    setSelected(t)
    setForm({
      titulo:                 t.titulo,
      descricao:              t.descricao ?? '',
      status:                 t.status,
      prioridade:             t.prioridade,
      categoria:              t.categoria ?? '',
      data_inicio:            t.data_inicio ?? '',
      data_conclusao_prevista: t.data_conclusao_prevista ?? '',
      observacoes:            t.observacoes ?? '',
      usuario_id:             t.usuario_id,
    })
    setOpenForm(true)
  }

  function openViewTarefa(t: Tarefa) {
    setSelected(t)
    setOpenView(true)
  }

  async function processarExtrato(tarefaId: string, file: File, onDone?: () => void) {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`/api/tarefas/${tarefaId}/extrato`, { method: 'POST', body: fd })
    const json = await res.json()
    if (!res.ok) {
      toast({ variant: 'destructive', title: 'Erro ao processar extrato', description: json.error })
      return
    }
    // Mostra modal com resultado detalhado
    setExtratoResultado({
      status:          json.status,
      data:            json.data,
      saldoAnterior:   json.saldoAnterior,
      saldoDia:        json.saldoDia,
      movimentoExtrato: json.movimentoExtrato,
      entradasAS:      json.entradasAS,
      saidasAS:        json.saidasAS,
      movimentoExterno: json.movimentoExterno,
      contaCodigo:     json.contaCodigo,
      diferenca:       json.diferenca,
      asAcessivel:     json.asAcessivel,
    })
    onDone?.()
    load()
  }

  async function handleUploadExtrato(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selected) return
    setUploadingExtrato(true)
    try {
      await processarExtrato(selected.id, file, () => setOpenView(false))
    } catch {
      toast({ variant: 'destructive', title: 'Erro inesperado ao enviar o arquivo' })
    } finally {
      setUploadingExtrato(false)
      e.target.value = ''
    }
  }

  async function handleUploadMulti(postoId: string, file: File) {
    setUploadingMultiPostoId(postoId)
    const postoNome = grupos.find(g => g.postoId === postoId)?.postoNome ?? postoId
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('posto_id', postoId)
      const res  = await fetch('/api/tarefas/extrato-multi', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) {
        toast({ variant: 'destructive', title: 'Erro ao processar extrato', description: json.error })
        return
      }
      const { ok_count, divergente_count, sem_tarefa_count, periodoIni, periodoFim, resultados } = json
      const fmtD = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('pt-BR')
      const range = periodoIni === periodoFim ? fmtD(periodoIni) : `${fmtD(periodoIni)} a ${fmtD(periodoFim)}`

      if (divergente_count > 0 || sem_tarefa_count > 0) {
        // Abre modal com detalhes dos dias divergentes
        setMultiResultado({ postoNome, range, resultados })
      } else {
        toast({ title: `✅ ${ok_count} dia(s) validados — ${range}`, description: 'Todas as tarefas do período foram concluídas.' })
      }
      load()
    } catch {
      toast({ variant: 'destructive', title: 'Erro inesperado ao enviar o arquivo' })
    } finally {
      setUploadingMultiPostoId(null)
    }
  }

  async function handleSave() {
    if (!form.titulo.trim()) {
      toast({ variant: 'destructive', title: 'O título da tarefa é obrigatório' })
      return
    }
    setSaving(true)

    // Para operadores, força usuario_id = seu próprio id
    const uid = isOperador ? (usuario?.id ?? '') : (form.usuario_id || (usuario?.id ?? ''))

    const payload: Record<string, unknown> = {
      titulo:                 form.titulo.trim(),
      descricao:              form.descricao  || null,
      status:                 form.status,
      prioridade:             form.prioridade,
      categoria:              form.categoria  || null,
      data_inicio:            form.data_inicio || null,
      data_conclusao_prevista: form.data_conclusao_prevista || null,
      observacoes:            form.observacoes || null,
      usuario_id:             uid,
      // Preenche data_conclusao_real ao concluir
      data_conclusao_real: form.status === 'concluido'
        ? (selected?.data_conclusao_real ?? new Date().toISOString())
        : null,
    }

    // empresa_id é obrigatório na criação
    if (!selected) {
      payload.empresa_id = usuario?.empresa_id ?? null
    }

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

  // Troca de status direto na tabela
  async function handleStatusChange(t: Tarefa, newStatus: StatusTarefa) {
    const extra: Record<string, unknown> = {}
    if (newStatus === 'concluido' && !t.data_conclusao_real) {
      extra.data_conclusao_real = new Date().toISOString()
    } else if (newStatus !== 'concluido') {
      extra.data_conclusao_real = null
    }
    const { error } = await supabase
      .from('tarefas')
      .update({ status: newStatus, ...extra })
      .eq('id', t.id)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao atualizar status', description: error.message })
    } else {
      load()
    }
  }

  // Abre modal de justificativa de atraso
  function openJustifyModal(t: Tarefa) {
    setJustifyTarget(t)
    setJustifyText(t.observacoes ?? '')
    setOpenJustify(true)
  }

  async function handleSaveJustify() {
    if (!justifyTarget) return
    setSavingJustify(true)
    const { error } = await supabase
      .from('tarefas')
      .update({ observacoes: justifyText.trim() || null })
      .eq('id', justifyTarget.id)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao salvar justificativa', description: error.message })
    } else {
      toast({ title: 'Justificativa salva!' })
      setOpenJustify(false)
      setJustifyTarget(null)
      load()
    }
    setSavingJustify(false)
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      <Header
        title="Gestão de Tarefas"
        description={
          isConciliador
            ? 'Suas tarefas de conciliação bancária'
            : isOperador
              ? 'Acompanhe e gerencie suas tarefas diárias'
              : 'Visualize e gerencie todas as tarefas da equipe'
        }
        actions={
          <div className="flex gap-2">
            {(isMaster || role === 'admin') && (
              <Button
                variant="outline"
                onClick={() => {
                  setDiaEspecialData(new Date().toISOString().slice(0, 10))
                  setDiaEspecialDesc('')
                  setOpenDiaEspecial(true)
                }}
                className="h-9 text-[13px] gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                <Landmark className="w-3.5 h-3.5" />
                <span className="btn-text">Dia Especial</span>
              </Button>
            )}
            {canCreate && (
              <Button
                onClick={openCreate}
                className="h-9 bg-orange-500 hover:bg-orange-600 text-[13px] gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="btn-text">Nova Tarefa</span>
              </Button>
            )}
          </div>
        }
      />

      <div className="p-3 md:p-6 space-y-5">

        {/* ── Cards de resumo ── */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <SummaryCard label="Total" value={resumo.total}       color="gray"   onClick={() => setFilterStatus('todos')} active={filterStatus === 'todos'} />
          <SummaryCard label="Pendentes" value={resumo.pendente} color="slate"  onClick={() => setFilterStatus(filterStatus === 'pendente' ? 'todos' : 'pendente')} active={filterStatus === 'pendente'} />
          <SummaryCard label="Em Andamento" value={resumo.em_andamento} color="blue" onClick={() => setFilterStatus(filterStatus === 'em_andamento' ? 'todos' : 'em_andamento')} active={filterStatus === 'em_andamento'} />
          <SummaryCard label="Concluídas" value={resumo.concluido} color="green" onClick={() => setFilterStatus(filterStatus === 'concluido' ? 'todos' : 'concluido')} active={filterStatus === 'concluido'} />
          <SummaryCard label="Atrasadas" value={resumo.atrasadas} color="red"  onClick={() => setFilterStatus('todos')} active={false} isAlert={resumo.atrasadas > 0} />
        </div>

        {/* ── Filtros ── */}
        <div className="bg-white border rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-500 uppercase tracking-wide">
            <Filter className="w-3.5 h-3.5" />
            Filtros
          </div>
          <div className="flex flex-col gap-3">
            <Input
              placeholder="Buscar por título, descrição..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9 text-[13px] w-full"
            />
            <Select value={filterPrioridade} onValueChange={v => setFilterPrioridade(v as PrioridadeTarefa | 'todos')}>
              <SelectTrigger className="h-9 text-[13px] w-full"><SelectValue placeholder="Prioridade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas prioridades</SelectItem>
                {(Object.keys(PRIORIDADE_CONFIG) as PrioridadeTarefa[]).map(p => (
                  <SelectItem key={p} value={p}>{PRIORIDADE_CONFIG[p].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Blocos por posto ── */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-[13px]">Carregando tarefas...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
            <ClipboardList className="w-10 h-10 opacity-30" />
            <p className="text-[13px]">
              {tarefas.length === 0 ? 'Nenhuma tarefa cadastrada.' : 'Nenhuma tarefa corresponde aos filtros.'}
            </p>
            {canCreate && tarefas.length === 0 && (
              <Button variant="outline" size="sm" onClick={openCreate} className="gap-1.5 text-[13px]">
                <Plus className="w-3.5 h-3.5" /> Criar primeira tarefa
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {grupos.map(grupo => {
              const atrasadas  = grupo.items.filter(isOverdue).length
              const concluidas = grupo.items.filter(t => t.status === 'concluido').length
              const pendentes  = grupo.items.filter(t => t.status === 'pendente' || t.status === 'em_andamento').length
              const temConciliacao = grupo.items.some(
                t => t.categoria === 'conciliacao_bancaria' && t.status !== 'concluido' && t.status !== 'cancelado'
              )
              const uploadandoMulti = uploadingMultiPostoId === grupo.postoId
              return (
                <div key={grupo.postoId} className={cn('rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm', expandidos.has(grupo.postoId) && 'border-orange-200')}>
                  {/* Cabeçalho do posto */}
                  <div className="flex items-center bg-gray-50 hover:bg-gray-100 transition-colors">
                    <button
                      className="flex-1 flex items-center justify-between px-4 py-3 text-left"
                      onClick={() => togglePosto(grupo.postoId)}
                    >
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                          <MapPin className="w-3.5 h-3.5 text-orange-600" />
                        </div>
                        <span className="font-semibold text-[13px] text-gray-800">{grupo.postoNome}</span>
                        <span className="text-[11px] text-gray-400 font-medium">
                          {grupo.items.length} tarefa{grupo.items.length !== 1 ? 's' : ''}
                        </span>
                        {grupo.postoId !== 'sem-posto' && (() => {
                          const uc = ultimoCaixaByPostoId[grupo.postoId]
                          if (uc === undefined) return null
                          const dias = uc ? Math.floor((Date.now() - new Date(uc + 'T12:00:00').getTime()) / 86_400_000) : null
                          const cor = dias === null ? 'bg-gray-100 text-gray-500'
                            : dias <= 1 ? 'bg-emerald-100 text-emerald-700'
                            : dias <= 3 ? 'bg-amber-100 text-amber-700'
                            : 'bg-red-100 text-red-700'
                          return (
                            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium', cor)}>
                              <Landmark className="w-3 h-3" />
                              Últ. caixa: {uc ? (() => { const [y,m,d] = uc.split('-'); return `${d}/${m}/${y}` })() : '—'}
                            </span>
                          )
                        })()}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {atrasadas > 0 && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                            {atrasadas} atrasada{atrasadas !== 1 ? 's' : ''}
                          </span>
                        )}
                        {concluidas > 0 && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                            {concluidas} concluída{concluidas !== 1 ? 's' : ''}
                          </span>
                        )}
                        {pendentes > 0 && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                            {pendentes} em aberto
                          </span>
                        )}
                        <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform ml-1', expandidos.has(grupo.postoId) && 'rotate-180')} />
                      </div>
                    </button>

                    {/* Botão extrato multi-dias — só aparece se houver conciliações pendentes */}
                    {temConciliacao && grupo.postoId !== 'sem-posto' && (
                      <div className="pr-3 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        <label className={cn(
                          'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors select-none',
                          uploadandoMulti
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm',
                        )}>
                          {uploadandoMulti
                            ? <><Loader2 className="w-3 h-3 animate-spin" /> Processando...</>
                            : <><Upload className="w-3 h-3" /> Extrato Multi-dias</>
                          }
                          <input
                            type="file" accept=".xlsx,.xls" className="hidden"
                            disabled={uploadandoMulti || uploadingMultiPostoId !== null}
                            onChange={async e => {
                              const f = e.target.files?.[0]
                              if (!f) return
                              await handleUploadMulti(grupo.postoId, f)
                              e.target.value = ''
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Tabela de tarefas do posto — só mostra se expandido */}
                  <div className={cn('overflow-x-auto', !expandidos.has(grupo.postoId) && 'hidden')}>
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="border-b bg-white">
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-400 text-[11px] uppercase tracking-wide">Tarefa</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-400 text-[11px] uppercase tracking-wide">Status</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-400 text-[11px] uppercase tracking-wide">Prioridade</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-400 text-[11px] uppercase tracking-wide">Categoria</th>
                          {!isRestrito && (
                            <th className="text-left px-4 py-2.5 font-semibold text-gray-400 text-[11px] uppercase tracking-wide">Responsável</th>
                          )}
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-400 text-[11px] uppercase tracking-wide">Dia</th>
                          <th className="px-4 py-2.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {grupo.items.map(t => {
                          const overdue = isOverdue(t)
                          return (
                            <tr key={t.id} className={cn('hover:bg-gray-50/60 transition-colors', overdue && 'bg-red-50/40')}>
                              <td className="px-4 py-3">
                                <div className="flex items-start gap-2">
                                  {overdue && <span title="Tarefa atrasada"><AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" /></span>}
                                  <div className="min-w-0">
                                    <p className="font-medium text-gray-800 leading-snug">{t.titulo}</p>
                                    {t.descricao && <p className="text-[11px] text-gray-400 mt-0.5">{t.descricao}</p>}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {canEdit && t.categoria !== 'conciliacao_bancaria' ? (
                                  <StatusDropdown value={t.status} onChange={s => handleStatusChange(t, s)} onlyConcluir={isConciliador} />
                                ) : (
                                  <StatusBadgeInline status={t.status} />
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <PrioridadeBadge prioridade={t.prioridade} />
                              </td>
                              <td className="px-4 py-3">
                                {t.categoria ? (
                                  <span className="text-[12px] text-gray-600 flex items-center gap-1">
                                    <Tag className="w-3 h-3 text-gray-400" />
                                    {CATEGORIA_LABELS[t.categoria]}
                                  </span>
                                ) : <span className="text-gray-300">—</span>}
                              </td>
                              {!isRestrito && (
                                <td className="px-4 py-3">
                                  <span className="text-[12px] text-gray-600 flex items-center gap-1">
                                    <User2 className="w-3 h-3 text-gray-400" />
                                    {(t.usuario as any)?.nome ?? '—'}
                                  </span>
                                </td>
                              )}
                              <td className="px-4 py-3">
                                {t.data_conclusao_prevista ? (
                                  <div className="space-y-1">
                                    <span className={cn('text-[12px] flex items-center gap-1', overdue ? 'text-red-600 font-medium' : 'text-gray-500')}>
                                      <Calendar className="w-3 h-3" />
                                      {formatDate(t.data_conclusao_prevista)}
                                    </span>
                                    {isConciliador && t.observacoes && (
                                      <span
                                        className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 flex items-center gap-1 max-w-[160px] cursor-pointer"
                                        title={t.observacoes}
                                        onClick={() => openJustifyModal(t)}
                                      >
                                        <MessageSquare className="w-2.5 h-2.5 flex-shrink-0" />
                                        <span className="truncate">{t.observacoes}</span>
                                      </span>
                                    )}
                                  </div>
                                ) : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1 justify-end">
                                  {t.categoria === 'conciliacao_bancaria' && t.status !== 'concluido' && t.status !== 'cancelado' && (
                                    <label className={cn(
                                      'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors',
                                      uploadingExtratoId === t.id
                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                        : 'bg-orange-500 hover:bg-orange-600 text-white shadow-sm',
                                    )}>
                                      {uploadingExtratoId === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                                      {uploadingExtratoId === t.id ? 'Enviando...' : 'Extrato'}
                                      <input
                                        type="file" accept=".xlsx,.xls" className="hidden"
                                        disabled={uploadingExtratoId !== null}
                                        onChange={async (e) => {
                                          const file = e.target.files?.[0]
                                          if (!file) return
                                          setUploadingExtratoId(t.id)
                                          try { await processarExtrato(t.id, file) }
                                          catch { toast({ variant: 'destructive', title: 'Erro inesperado ao enviar o arquivo' }) }
                                          finally { setUploadingExtratoId(null); e.target.value = '' }
                                        }}
                                      />
                                    </label>
                                  )}
                                  {isConciliador && overdue && (
                                    <Button
                                      variant="ghost" size="sm"
                                      className={cn('h-7 px-2 text-[11px] gap-1 font-medium rounded-lg', t.observacoes ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50' : 'text-red-600 hover:text-red-700 hover:bg-red-50')}
                                      onClick={() => openJustifyModal(t)}
                                    >
                                      <MessageSquare className="w-3.5 h-3.5" />
                                      {t.observacoes ? 'Justificado' : 'Justificar'}
                                    </Button>
                                  )}
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-gray-700 hover:bg-gray-100" onClick={() => openViewTarefa(t)} title="Ver detalhes">
                                    <Eye className="w-3.5 h-3.5" />
                                  </Button>
                                  {canEdit && (
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50" onClick={() => openEditTarefa(t)} title="Editar">
                                      <Pencil className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                  {canDelete && (
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-red-600 hover:bg-red-50" onClick={() => { setSelected(t); setOpenDelete(true) }} title="Excluir">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
            <p className="text-[11px] text-gray-400 text-right">
              {filtered.length} tarefa{filtered.length !== 1 ? 's' : ''} em {grupos.length} posto{grupos.length !== 1 ? 's' : ''}
              {filtered.length !== tarefas.length && ` (de ${tarefas.length} total)`}
            </p>
          </div>
        )}
      </div>

      {/* ── Modal criar/editar ── */}
      <Dialog open={openForm} onOpenChange={open => { if (!saving) setOpenForm(open) }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                <ClipboardList className="w-4 h-4 text-orange-600" />
              </div>
              <DialogTitle>{selected ? 'Editar Tarefa' : 'Nova Tarefa'}</DialogTitle>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Aviso para conciliador */}
            {isConciliador && (
              <div className="flex items-start gap-2 p-3 bg-cyan-50 border border-cyan-200 rounded-lg text-[12px] text-cyan-700">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>Esta tarefa foi gerada automaticamente. Você pode adicionar observações abaixo.</span>
              </div>
            )}

            {/* Título */}
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Título da tarefa *</Label>
              <Input
                autoFocus={!isConciliador}
                disabled={isConciliador}
                value={form.titulo}
                onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
                placeholder="Ex: Fechar caixa do dia, Lançar notas fiscais..."
              />
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Descrição</Label>
              <Textarea
                disabled={isConciliador}
                value={form.descricao}
                onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
                placeholder="Detalhes sobre a tarefa..."
                rows={2}
              />
            </div>

            {/* Categoria */}
            {!isConciliador && (
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Categoria</Label>
                <Select
                  value={form.categoria || '__none__'}
                  onValueChange={v => setForm(p => ({ ...p, categoria: v === '__none__' ? '' : v as CategoriaTarefa }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem categoria</SelectItem>
                    {(Object.entries(CATEGORIA_LABELS) as [CategoriaTarefa, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Status + Prioridade */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Status</Label>
                <Select
                  value={form.status}
                  disabled={isConciliador}
                  onValueChange={v => setForm(p => ({ ...p, status: v as StatusTarefa }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(isConciliador
                      ? [['em_andamento', STATUS_CONFIG['em_andamento']], ['concluido', STATUS_CONFIG['concluido']]] as [StatusTarefa, typeof STATUS_CONFIG[StatusTarefa]][]
                      : Object.entries(STATUS_CONFIG) as [StatusTarefa, typeof STATUS_CONFIG[StatusTarefa]][]
                    ).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Prioridade</Label>
                <Select
                  value={form.prioridade}
                  disabled={isConciliador}
                  onValueChange={v => setForm(p => ({ ...p, prioridade: v as PrioridadeTarefa }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(PRIORIDADE_CONFIG) as [PrioridadeTarefa, typeof PRIORIDADE_CONFIG[PrioridadeTarefa]][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Datas */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Data de referência</Label>
                <Input
                  type="date"
                  disabled={isConciliador}
                  value={form.data_inicio}
                  onChange={e => setForm(p => ({ ...p, data_inicio: e.target.value }))}
                  className="text-[13px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Prazo de conclusão</Label>
                <Input
                  type="date"
                  disabled={isConciliador}
                  value={form.data_conclusao_prevista}
                  onChange={e => setForm(p => ({ ...p, data_conclusao_prevista: e.target.value }))}
                  className="text-[13px]"
                />
              </div>
            </div>

            {/* Responsável (admin/master) */}
            {!isRestrito && usuarios.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Responsável</Label>
                <Select
                  value={form.usuario_id || '__me__'}
                  onValueChange={v => setForm(p => ({ ...p, usuario_id: v === '__me__' ? (usuario?.id ?? '') : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={usuario?.id ?? '__me__'}>
                      {usuario?.nome} (você)
                    </SelectItem>
                    {usuarios
                      .filter(u => u.id !== usuario?.id)
                      .map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Observações */}
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Observações</Label>
              <Textarea
                value={form.observacoes}
                onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
                placeholder="Informações adicionais, dúvidas, pendências..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenForm(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-orange-500 hover:bg-orange-600 min-w-[90px]"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : selected ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal visualizar ── */}
      <Dialog open={openView} onOpenChange={setOpenView}>
        <DialogContent className={selected?.categoria === 'conciliacao_bancaria' ? 'max-w-lg' : 'max-w-md'}>
          {selected && (
            <>
              <DialogHeader>
                <div className="flex items-start gap-2.5 mb-1">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <ClipboardList className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <DialogTitle className="text-[15px] leading-snug">{selected.titulo}</DialogTitle>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Criada em {formatDate(selected.criado_em.split('T')[0])}
                    </p>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 py-1">
                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                  <StatusBadgeInline status={selected.status} />
                  <PrioridadeBadge prioridade={selected.prioridade} />
                  {selected.categoria && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-100 text-purple-700 border border-purple-200">
                      <Tag className="w-3 h-3" />
                      {CATEGORIA_LABELS[selected.categoria]}
                    </span>
                  )}
                  {isOverdue(selected) && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-100 text-red-700 border border-red-200">
                      <AlertTriangle className="w-3 h-3" />
                      Atrasada
                    </span>
                  )}
                </div>

                {/* Descrição */}
                {selected.descricao && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Descrição</p>
                    <p className="text-[13px] text-gray-700 whitespace-pre-wrap">{selected.descricao}</p>
                  </div>
                )}

                {/* Datas */}
                <div className="grid grid-cols-2 gap-3 text-[13px]">
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Início</p>
                    <p className="text-gray-700">{formatDate(selected.data_inicio)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Prazo</p>
                    <p className={cn('font-medium', isOverdue(selected) ? 'text-red-600' : 'text-gray-700')}>
                      {formatDate(selected.data_conclusao_prevista)}
                    </p>
                  </div>
                  {selected.data_conclusao_real && (
                    <div className="col-span-2">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Concluída em</p>
                      <p className="text-green-600 font-medium">
                        {new Date(selected.data_conclusao_real).toLocaleDateString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                  )}
                </div>

                {/* Responsável */}
                {(selected.usuario as any)?.nome && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Responsável</p>
                    <p className="text-[13px] text-gray-700 flex items-center gap-1.5">
                      <User2 className="w-3.5 h-3.5 text-gray-400" />
                      {(selected.usuario as any).nome}
                    </p>
                  </div>
                )}

                {/* Observações / Justificativa de atraso */}
                {selected.observacoes && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      {isOverdue(selected) ? 'Justificativa do Atraso' : 'Observações'}
                    </p>
                    <p className={cn(
                      'text-[13px] text-gray-700 whitespace-pre-wrap p-3 rounded-lg border',
                      isOverdue(selected) ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-gray-50',
                    )}>
                      {selected.observacoes}
                    </p>
                  </div>
                )}

                {/* ── Painel de Extrato Bancário (apenas conciliação bancária) ── */}
                {selected.categoria === 'conciliacao_bancaria' && selected.status !== 'concluido' && selected.status !== 'cancelado' && (
                  <div className="border border-orange-200 rounded-xl p-4 bg-orange-50/40 space-y-3">
                    <p className="text-[12px] font-semibold text-orange-700 uppercase tracking-wide flex items-center gap-1.5">
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Extrato Bancário
                    </p>

                    {/* Resultado de validação anterior com divergência */}
                    {selected.extrato_status === 'divergente' && selected.extrato_arquivo_nome && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
                        <p className="text-[11px] font-semibold text-red-700 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Divergência encontrada
                        </p>
                        <p className="text-[11px] text-red-600">{selected.extrato_arquivo_nome} — {selected.extrato_data ? new Date(selected.extrato_data + 'T12:00:00').toLocaleDateString('pt-BR') : ''}</p>
                        <div className="grid grid-cols-3 gap-1 text-[11px]">
                          <div className="bg-white rounded p-1.5 border border-red-100 text-center">
                            <p className="text-gray-400 mb-0.5">Extrato</p>
                            <p className="font-mono font-semibold text-gray-800">
                              {selected.extrato_movimento !== null ? (selected.extrato_movimento >= 0 ? '+' : '') + selected.extrato_movimento.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}
                            </p>
                          </div>
                          <div className="bg-white rounded p-1.5 border border-red-100 text-center">
                            <p className="text-gray-400 mb-0.5">AUTOSYSTEM</p>
                            <p className="font-mono font-semibold text-gray-800">
                              {selected.extrato_saldo_externo !== null ? (selected.extrato_saldo_externo >= 0 ? '+' : '') + selected.extrato_saldo_externo.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}
                            </p>
                          </div>
                          <div className="bg-red-100 rounded p-1.5 border border-red-200 text-center">
                            <p className="text-red-500 mb-0.5">Diferença</p>
                            <p className="font-mono font-semibold text-red-700">
                              {selected.extrato_diferenca !== null ? (selected.extrato_diferenca >= 0 ? '+' : '') + selected.extrato_diferenca.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}
                            </p>
                          </div>
                        </div>
                        <p className="text-[10px] text-red-500">Envie um novo extrato para tentar novamente.</p>
                      </div>
                    )}

                    {/* Botão de upload principal */}
                    <label className={cn(
                      'flex items-center justify-center gap-2 w-full h-11 rounded-lg text-[14px] font-semibold cursor-pointer transition-colors shadow-sm',
                      uploadingExtrato
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-orange-500 hover:bg-orange-600 text-white',
                    )}>
                      {uploadingExtrato
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Processando extrato...</>
                        : <><Upload className="w-4 h-4" /> Anexar Extrato Excel</>
                      }
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        disabled={uploadingExtrato}
                        onChange={handleUploadExtrato}
                      />
                    </label>
                    <p className="text-[11px] text-orange-600 text-center">
                      O sistema valida automaticamente e conclui a tarefa se os valores baterem.
                    </p>
                  </div>
                )}

                {/* Resultado OK já registrado (tarefa ainda aberta por outro motivo) */}
                {selected.extrato_status === 'ok' && selected.extrato_arquivo_nome && (
                  <div className="rounded-md border border-green-200 bg-green-50 p-2.5 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="text-[12px] font-semibold text-green-700">Extrato validado</p>
                      <p className="text-[11px] text-green-600">{selected.extrato_arquivo_nome} — {selected.extrato_data ? new Date(selected.extrato_data + 'T12:00:00').toLocaleDateString('pt-BR') : ''}</p>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter>
                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-[13px]"
                    onClick={() => { setOpenView(false); openEditTarefa(selected) }}
                  >
                    <Pencil className="w-3.5 h-3.5" /> Editar
                  </Button>
                )}
                <Button size="sm" onClick={() => setOpenView(false)} className="bg-orange-500 hover:bg-orange-600 text-[13px]">
                  Fechar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Modal: Justificar Atraso (conciliador) ── */}
      <Dialog open={openJustify} onOpenChange={open => { if (!savingJustify) { setOpenJustify(open); if (!open) setJustifyTarget(null) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                <MessageSquare className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <DialogTitle>Justificar Atraso</DialogTitle>
                {justifyTarget && (
                  <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[280px]">
                    {justifyTarget.titulo}
                  </p>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {justifyTarget && isOverdue(justifyTarget) && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-[12px] text-red-700">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>
                  Prazo vencido em <strong>{formatDate(justifyTarget.data_conclusao_prevista)}</strong>
                </span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">
                Motivo do atraso <span className="text-red-500">*</span>
              </Label>
              <Textarea
                autoFocus
                value={justifyText}
                onChange={e => setJustifyText(e.target.value)}
                placeholder="Descreva o motivo pelo qual esta conciliação está em atraso..."
                rows={4}
                className="resize-none text-[13px]"
              />
              <p className="text-[11px] text-gray-400">
                Esta justificativa ficará visível para os administradores.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setOpenJustify(false); setJustifyTarget(null) }}
              disabled={savingJustify}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveJustify}
              disabled={savingJustify || !justifyText.trim()}
              className="bg-amber-500 hover:bg-amber-600 min-w-[100px]"
            >
              {savingJustify ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar Justificativa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm delete ── */}
      <ConfirmDialog
        open={openDelete}
        onOpenChange={open => { if (!deleting) setOpenDelete(open) }}
        title="Excluir tarefa"
        description={`Excluir "${selected?.titulo}"? Esta ação não pode ser desfeita.`}
        onConfirm={handleDelete}
        loading={deleting}
      />

      {/* ── Modal gerar dia especial ── */}
      <Dialog open={openDiaEspecial} onOpenChange={o => { if (!gerandoEspecial) setOpenDiaEspecial(o) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <Landmark className="w-4 h-4 text-blue-600" />
              </div>
              <DialogTitle>Gerar Tarefas — Dia Especial</DialogTitle>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Aviso contextual */}
            <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-[12px] text-blue-700 leading-relaxed">
                Use para feriados com <strong>expediente bancário</strong> (ponto facultativo, feriado estadual com compensação, etc).
                Serão criadas tarefas de conciliação para <strong>todos os postos</strong> na data escolhida.
                Se as tarefas já existirem, serão ignoradas.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Data do dia especial *</Label>
              <Input
                type="date"
                value={diaEspecialData}
                onChange={e => setDiaEspecialData(e.target.value)}
                className="h-9 text-[13px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Motivo / descrição <span className="text-gray-400 font-normal">(opcional)</span></Label>
              <Input
                value={diaEspecialDesc}
                onChange={e => setDiaEspecialDesc(e.target.value)}
                placeholder="Ex: Feriado estadual com expediente bancário Sicoob"
                className="h-9 text-[13px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDiaEspecial(false)} disabled={gerandoEspecial}>
              Cancelar
            </Button>
            <Button
              onClick={handleGerarDiaEspecial}
              disabled={gerandoEspecial || !diaEspecialData}
              className="bg-blue-600 hover:bg-blue-700 min-w-[120px]"
            >
              {gerandoEspecial
                ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Gerando...</>
                : <><Landmark className="w-4 h-4 mr-1" /> Gerar Tarefas</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal resultado extrato multi-dias ── */}
      <Dialog open={!!multiResultado} onOpenChange={o => { if (!o) setMultiResultado(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                <FileSpreadsheet className="w-4 h-4 text-orange-600" />
              </div>
              <div>
                <DialogTitle>Resultado do Extrato Multi-dias</DialogTitle>
                {multiResultado && (
                  <p className="text-[12px] text-gray-500 mt-0.5">{multiResultado.postoNome} · {multiResultado.range}</p>
                )}
              </div>
            </div>
          </DialogHeader>

          {multiResultado && (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {multiResultado.resultados.map(r => {
                const d = new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR')
                const fmtVal = (v: number) => (v >= 0 ? '+' : '') + v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                const isOk  = r.status === 'ok'
                const isSem = r.status === 'sem_tarefa'
                return (
                  <div key={r.data} className={cn(
                    'rounded-lg border p-3',
                    isOk  ? 'bg-green-50 border-green-200' :
                    isSem ? 'bg-gray-50 border-gray-200'  :
                            'bg-red-50 border-red-200',
                  )}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[13px] font-semibold text-gray-800">{d}</span>
                      <span className={cn(
                        'text-[11px] font-semibold px-2 py-0.5 rounded-full',
                        isOk  ? 'bg-green-100 text-green-700' :
                        isSem ? 'bg-gray-100 text-gray-500'   :
                                'bg-red-100 text-red-700',
                      )}>
                        {isOk ? '✓ OK' : isSem ? 'Sem tarefa' : '⚠ Divergente'}
                      </span>
                    </div>
                    {!isSem && (
                      <div className="grid grid-cols-3 gap-2 text-[12px]">
                        <div className="bg-white rounded p-1.5 border border-gray-100 text-center">
                          <p className="text-[10px] text-gray-400 mb-0.5">Extrato</p>
                          <p className="font-mono font-semibold text-gray-700">{fmtVal(r.movimentoExtrato)}</p>
                        </div>
                        <div className="bg-white rounded p-1.5 border border-gray-100 text-center">
                          <p className="text-[10px] text-gray-400 mb-0.5">AutoSystem</p>
                          <p className="font-mono font-semibold text-gray-700">{fmtVal(r.movimentoAS)}</p>
                        </div>
                        <div className={cn(
                          'rounded p-1.5 border text-center',
                          isOk ? 'bg-green-100 border-green-200' : 'bg-red-100 border-red-200',
                        )}>
                          <p className="text-[10px] text-gray-400 mb-0.5">Diferença</p>
                          <p className={cn('font-mono font-bold', isOk ? 'text-green-700' : 'text-red-700')}>
                            {fmtVal(r.diferenca)}
                          </p>
                        </div>
                      </div>
                    )}
                    {isSem && (
                      <p className="text-[11px] text-gray-500">Nenhuma tarefa de conciliação encontrada para este dia.</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setMultiResultado(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal resultado extrato único ── */}
      <Dialog open={!!extratoResultado} onOpenChange={o => { if (!o) setExtratoResultado(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', extratoResultado?.status === 'ok' ? 'bg-green-100' : 'bg-red-100')}>
                {extratoResultado?.status === 'ok'
                  ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                  : <AlertTriangle className="w-4 h-4 text-red-600" />
                }
              </div>
              <div>
                <DialogTitle>{extratoResultado?.status === 'ok' ? 'Extrato Validado' : 'Divergência Encontrada'}</DialogTitle>
                {extratoResultado && (
                  <p className="text-[12px] text-gray-500 mt-0.5">
                    {new Date(extratoResultado.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>
          </DialogHeader>

          {extratoResultado && (() => {
            const fmtV = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            const fmtVS = (v: number) => (v >= 0 ? '+' : '') + v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            const isOk = extratoResultado.status === 'ok'
            return (
              <div className="space-y-3">
                {/* Extrato Excel */}
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                  <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <FileSpreadsheet className="w-3.5 h-3.5" /> Extrato Excel
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white rounded-lg border border-blue-100 p-2">
                      <p className="text-[10px] text-gray-400 mb-1">Saldo Anterior</p>
                      <p className="text-[13px] font-mono font-semibold text-gray-700">{fmtV(extratoResultado.saldoAnterior)}</p>
                    </div>
                    <div className="bg-white rounded-lg border border-blue-100 p-2">
                      <p className="text-[10px] text-gray-400 mb-1">Saldo do Dia</p>
                      <p className="text-[13px] font-mono font-semibold text-gray-700">{fmtV(extratoResultado.saldoDia)}</p>
                    </div>
                    <div className="bg-blue-100 rounded-lg border border-blue-200 p-2">
                      <p className="text-[10px] text-blue-600 mb-1">Movimento</p>
                      <p className="text-[13px] font-mono font-bold text-blue-800">{fmtVS(extratoResultado.movimentoExtrato)}</p>
                    </div>
                  </div>
                </div>

                {/* AUTOSYSTEM */}
                {extratoResultado.asAcessivel ? (
                  <div className="rounded-xl border border-purple-200 bg-purple-50 p-3">
                    <p className="text-[11px] font-semibold text-purple-700 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                      <Landmark className="w-3.5 h-3.5" /> AUTOSYSTEM
                      {extratoResultado.contaCodigo && (
                        <span className="font-mono text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded">
                          Conta {extratoResultado.contaCodigo}
                        </span>
                      )}
                    </p>
                    {extratoResultado.entradasAS !== null && extratoResultado.saidasAS !== null ? (
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-white rounded-lg border border-purple-100 p-2">
                          <p className="text-[10px] text-gray-400 mb-1">Entradas</p>
                          <p className="text-[13px] font-mono font-semibold text-green-700">{fmtV(extratoResultado.entradasAS)}</p>
                        </div>
                        <div className="bg-white rounded-lg border border-purple-100 p-2">
                          <p className="text-[10px] text-gray-400 mb-1">Saídas</p>
                          <p className="text-[13px] font-mono font-semibold text-red-700">{fmtV(extratoResultado.saidasAS)}</p>
                        </div>
                        <div className="bg-purple-100 rounded-lg border border-purple-200 p-2">
                          <p className="text-[10px] text-purple-600 mb-1">Saldo</p>
                          <p className="text-[13px] font-mono font-bold text-purple-800">{fmtVS(extratoResultado.movimentoExterno)}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white rounded-lg border border-purple-100 p-2 text-center">
                        <p className="text-[10px] text-gray-400 mb-1">Movimento (sem conta mapeada)</p>
                        <p className="text-[14px] font-mono font-bold text-purple-800">{fmtVS(extratoResultado.movimentoExterno)}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center">
                    <p className="text-[12px] text-gray-400">AUTOSYSTEM inacessível — comparação não realizada</p>
                  </div>
                )}

                {/* Resultado */}
                <div className={cn('rounded-xl border p-3 text-center', isOk ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50')}>
                  {isOk ? (
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <p className="text-[14px] font-bold text-green-800">Valores conferem — Tarefa concluída!</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-center justify-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                        <p className="text-[14px] font-bold text-red-800">Divergência de {fmtV(Math.abs(extratoResultado.diferenca))}</p>
                      </div>
                      <p className="text-[11px] text-red-500">Verifique o extrato ou os lançamentos no AUTOSYSTEM.</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          <DialogFooter>
            <Button
              className={cn(extratoResultado?.status === 'ok' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700')}
              onClick={() => setExtratoResultado(null)}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Subcomponentes ────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, color, onClick, active, isAlert = false,
}: {
  label: string
  value: number
  color: 'gray' | 'slate' | 'blue' | 'green' | 'red'
  onClick: () => void
  active: boolean
  isAlert?: boolean
}) {
  const colorMap = {
    gray:  'border-gray-200 bg-gray-50 text-gray-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    blue:  'border-blue-200 bg-blue-50 text-blue-700',
    green: 'border-green-200 bg-green-50 text-green-700',
    red:   'border-red-200 bg-red-50 text-red-700',
  }
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-xl border p-4 text-left transition-all',
        colorMap[color],
        active && 'ring-2 ring-orange-400 ring-offset-1',
        isAlert && value > 0 && 'animate-pulse',
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-60">{label}</p>
      <p className="text-2xl font-bold mt-0.5">{value}</p>
    </button>
  )
}

function StatusDropdown({
  value, onChange, onlyConcluir = false,
}: {
  value: StatusTarefa
  onChange: (s: StatusTarefa) => void
  onlyConcluir?: boolean
}) {
  const cfg = STATUS_CONFIG[value]
  const Icon = cfg.icon

  // Conciliador já concluiu — só mostra badge sem interação
  if (onlyConcluir && value === 'concluido') {
    return <StatusBadgeInline status={value} />
  }

  // Conciliador com tarefa ainda aberta — só pode marcar como concluído
  const opcoes = onlyConcluir
    ? ([[value, STATUS_CONFIG[value]], ['concluido', STATUS_CONFIG['concluido']]] as [StatusTarefa, typeof STATUS_CONFIG[StatusTarefa]][])
        .filter(([k]) => k === value || k === 'concluido')
    : (Object.entries(STATUS_CONFIG) as [StatusTarefa, typeof STATUS_CONFIG[StatusTarefa]][])

  return (
    <Select value={value} onValueChange={v => onChange(v as StatusTarefa)}>
      <SelectTrigger className={cn(
        'h-7 w-auto border text-[11px] font-medium px-2 gap-1 rounded-full',
        cfg.className,
        'focus:ring-1 focus:ring-orange-400',
      )}>
        <Icon className="w-3 h-3" />
        <SelectValue />
        <ChevronDown className="w-2.5 h-2.5 opacity-60" />
      </SelectTrigger>
      <SelectContent>
        {opcoes.map(([k, v]) => {
          const ItemIcon = v.icon
          return (
            <SelectItem key={k} value={k}>
              <span className="flex items-center gap-1.5 text-[12px]">
                <ItemIcon className="w-3.5 h-3.5" />
                {v.label}
              </span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
