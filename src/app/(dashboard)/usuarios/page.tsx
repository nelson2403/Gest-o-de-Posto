'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { DataTable } from '@/components/shared/DataTable'
import { AtivoInativoBadge } from '@/components/shared/StatusBadge'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { PermissionGuard } from '@/components/layout/PermissionGuard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { useAuthContext } from '@/contexts/AuthContext'
import { can, PERMISSIONS, ROLE_LABELS, ROLE_COLORS, getRoleLabel, getRoleColor } from '@/lib/utils/permissions'
import { formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils/cn'
import {
  Plus, Pencil, Trash2, Loader2, Eye, EyeOff, UserCircle, KeyRound, MapPin,
  CheckCircle2, XCircle, ClipboardList, RotateCcw, AlertTriangle, Info,
} from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import type { Usuario, Empresa, Posto, Role, PerfilPermissoes } from '@/types/database.types'

const EMPTY_FORM = { nome: '', email: '', senha: '', role: 'operador_caixa' as Role, empresa_id: '', posto_fechamento_id: '', postos_fechamento_ids: [] as string[], perfil_id: '' }

// Grupos de permissões para exibição no painel de detalhes
const PERM_GRUPOS = [
  {
    label: 'Dashboard & Relatórios',
    items: [
      { label: 'Dashboard', key: 'dashboard.view' },
      { label: 'Analítico', key: 'analitico.view' },
      { label: 'Relatórios', key: 'relatorios.view' },
      { label: 'Rel. Conciliação', key: 'relatorios.conciliacao' },
    ],
  },
  {
    label: 'Gestão de Usuários',
    items: [
      { label: 'Ver usuários', key: 'usuarios.view' },
      { label: 'Criar usuários', key: 'usuarios.create' },
      { label: 'Editar usuários', key: 'usuarios.edit' },
      { label: 'Excluir usuários', key: 'usuarios.delete' },
    ],
  },
  {
    label: 'Postos & Empresas',
    items: [
      { label: 'Ver postos', key: 'postos.view' },
      { label: 'Criar/editar postos', key: 'postos.create' },
      { label: 'Ver empresas', key: 'empresas.view' },
      { label: 'Gerenciar empresas', key: 'empresas.create' },
    ],
  },
  {
    label: 'Tarefas',
    items: [
      { label: 'Ver tarefas', key: 'tarefas.view' },
      { label: 'Criar tarefas', key: 'tarefas.create' },
      { label: 'Editar tarefas', key: 'tarefas.edit' },
      { label: 'Excluir tarefas', key: 'tarefas.delete' },
      { label: 'Tarefas recorrentes', key: 'tarefas_recorrentes.view' },
    ],
  },
  {
    label: 'Equipamentos & TI',
    items: [
      { label: 'Maquininhas', key: 'maquininhas.view' },
      { label: 'Portais/Acessos', key: 'portais.view' },
      { label: 'AnyDesk', key: 'anydesk.view' },
      { label: 'Servidores', key: 'servidores.view' },
      { label: 'Câmeras', key: 'cameras.view' },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { label: 'Extrato bancário', key: 'extrato_painel.view' },
      { label: 'Contas a receber', key: 'contas_receber.view' },
      { label: 'Contas bancárias', key: 'contas_bancarias.view' },
      { label: 'Controle de caixas', key: 'controle_caixas.view' },
    ],
  },
] as const

export default function UsuariosPage() {
  const { usuario } = useAuthContext()
  const supabase = createClient()
  const role = usuario?.role as Role | undefined

  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showPass, setShowPass] = useState(false)

  const [openForm,   setOpenForm]   = useState(false)
  const [openDelete, setOpenDelete] = useState(false)
  const [openReset,  setOpenReset]  = useState(false)
  const [selected,   setSelected]   = useState<Usuario | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [novaSenha,    setNovaSenha]    = useState('')
  const [showNovaSenha, setShowNovaSenha] = useState(false)
  const [savingReset,  setSavingReset]  = useState(false)

  // ── Painel de detalhes ────────────────────────────────────────────
  const [openDetalhe,    setOpenDetalhe]    = useState(false)
  const [loadingDetalhe, setLoadingDetalhe] = useState(false)
  const [detalheStats, setDetalheStats] = useState<{
    totalTarefas: number
    abertas: number
    concluidas: number
    canceladas: number
    recorrentes: number
    postos: string[]
  } | null>(null)

  // ── Perfis customizados ────────────────────────────────────────────
  const [perfis, setPerfis] = useState<PerfilPermissoes[]>([])

  // ── Usuários com tarefas recorrentes vinculadas ────────────────────
  const [comRecorrentes, setComRecorrentes] = useState<Set<string>>(new Set())

  // ── Postos do Conciliador ──────────────────────────────────────────
  const [openPostos,      setOpenPostos]      = useState(false)
  const [postosEmpresa,   setPostosEmpresa]   = useState<Pick<Posto, 'id' | 'nome'>[]>([])
  const [postosAtivos,    setPostosAtivos]    = useState<Set<string>>(new Set())
  const [loadingPostos,   setLoadingPostos]   = useState(false)
  const [savingPostos,    setSavingPostos]    = useState(false)

  // Modal posto do gerente (seleção única)
  const [openPostoGerente,    setOpenPostoGerente]    = useState(false)
  const [postosGerente,       setPostosGerente]       = useState<Pick<Posto, 'id' | 'nome'>[]>([])
  const [postoGerenteSel,     setPostoGerenteSel]     = useState<string>('')
  const [loadingPostoGerente, setLoadingPostoGerente] = useState(false)
  const [savingPostoGerente,  setSavingPostoGerente]  = useState(false)

  // ── Lista global de postos (para exibir na tabela e nos formulários) ─
  const [todosPostos,  setTodosPostos]  = useState<Pick<Posto, 'id' | 'nome'>[]>([])
  const [postosForm,   setPostosForm]   = useState<Pick<Posto, 'id' | 'nome'>[]>([])

  // ── Multi-postos para operador_caixa ───────────────────────────
  const [postosCaixaSel, setPostosCaixaSel] = useState<Set<string>>(new Set())

  async function load() {
    setLoading(true)
    const [usuariosRes, recorrentesRes, postosRes] = await Promise.all([
      supabase.from('usuarios').select('*, empresa:empresas(id, nome), perfil:perfis_permissoes(id, nome, permissoes)').order('nome'),
      supabase.from('tarefas_recorrentes').select('usuario_id').eq('ativo', true).not('usuario_id', 'is', null),
      supabase.from('postos').select('id, nome').order('nome'),
    ])
    if (!usuariosRes.error) setUsuarios(usuariosRes.data as Usuario[])
    setComRecorrentes(new Set((recorrentesRes.data ?? []).map(r => r.usuario_id as string)))
    if (postosRes.data) setTodosPostos(postosRes.data as Pick<Posto, 'id' | 'nome'>[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    if (role === 'master') {
      supabase.from('empresas').select('id, nome').order('nome').then(({ data }) => {
        if (data) setEmpresas(data as Empresa[])
      })
    }
    // Carrega perfis customizados (exclui overrides de cargo)
    {
      let q = supabase.from('perfis_permissoes').select('*').order('nome')
      if (usuario?.empresa_id) q = q.eq('empresa_id', usuario.empresa_id)
      q.then(({ data }) => {
        if (data) setPerfis(
          (data as PerfilPermissoes[]).filter((p: any) => !p.is_role_override)
        )
      })
    }
  }, [role])

  async function loadPostosParaFechador(empresaId: string) {
    if (!empresaId) { setPostosForm([]); return }
    const { data } = await supabase.from('postos').select('id, nome').eq('empresa_id', empresaId).order('nome')
    setPostosForm((data ?? []) as Pick<Posto, 'id' | 'nome'>[])
  }

  // ── Abrir painel de detalhes ───────────────────────────────────────
  async function openVerDetalhe(u: Usuario) {
    setSelected(u)
    setDetalheStats(null)
    setLoadingDetalhe(true)
    setOpenDetalhe(true)

    const [tarefasRes, recorrentesRes, postosRes] = await Promise.all([
      supabase.from('tarefas').select('status').eq('responsavel_id', u.id),
      supabase.from('tarefas_recorrentes').select('id', { count: 'exact', head: true }).eq('usuario_id', u.id).eq('ativo', true),
      u.role === 'operador_conciliador'
        ? supabase.from('tarefas_recorrentes').select('posto:postos(nome)').eq('usuario_id', u.id).eq('ativo', true).not('posto_id', 'is', null)
        : Promise.resolve({ data: [] as { posto: { nome: string } | null }[] }),
    ])

    const tarefas = tarefasRes.data ?? []
    const abertas    = tarefas.filter(t => ['aberta', 'em_andamento', 'pendente'].includes(t.status)).length
    const concluidas = tarefas.filter(t => t.status === 'concluida').length
    const canceladas = tarefas.filter(t => t.status === 'cancelada').length
    const recorrentes = recorrentesRes.count ?? 0
    const postos = (postosRes.data ?? [] as any[])
      .map((r: any) => r.posto?.nome)
      .filter(Boolean) as string[]

    setDetalheStats({ totalTarefas: tarefas.length, abertas, concluidas, canceladas, recorrentes, postos })
    setLoadingDetalhe(false)
  }

  function openCreate() {
    setSelected(null)
    const empId = usuario?.empresa_id ?? ''
    setForm({ ...EMPTY_FORM, empresa_id: empId })
    setPostosForm([])
    setPostosCaixaSel(new Set())
    setShowPass(false)
    setOpenForm(true)
  }

  async function openEdit(u: Usuario) {
    setSelected(u)
    setForm({
      nome: u.nome, email: u.email, senha: '',
      role: u.role, empresa_id: u.empresa_id ?? '',
      posto_fechamento_id: (u as Usuario & { posto_fechamento_id?: string | null }).posto_fechamento_id ?? '',
      postos_fechamento_ids: [],
      perfil_id: u.perfil_id ?? '',
    })
    setPostosCaixaSel(new Set())
    if ((u.role === 'operador_caixa' || u.role === 'gerente') && u.empresa_id) {
      await loadPostosParaFechador(u.empresa_id)
    }
    if (u.role === 'operador_caixa') {
      const { data } = await supabase
        .from('usuario_postos_caixa')
        .select('posto_id')
        .eq('usuario_id', u.id)
      if (data?.length) {
        setPostosCaixaSel(new Set(data.map(r => r.posto_id as string)))
      } else if ((u as any).posto_fechamento_id) {
        setPostosCaixaSel(new Set([(u as any).posto_fechamento_id]))
      }
    }
    setShowPass(false)
    setOpenForm(true)
  }

  async function openGerenciarPostos(u: Usuario) {
    setSelected(u)
    setLoadingPostos(true)
    setOpenPostos(true)

    const { data: postos } = await supabase
      .from('postos')
      .select('id, nome')
      .eq('empresa_id', u.empresa_id)
      .order('nome')

    const { data: recorrentes } = await supabase
      .from('tarefas_recorrentes')
      .select('posto_id')
      .eq('usuario_id', u.id)
      .eq('ativo', true)
      .not('posto_id', 'is', null)

    setPostosEmpresa((postos ?? []) as Pick<Posto, 'id' | 'nome'>[])
    setPostosAtivos(new Set((recorrentes ?? []).map(r => r.posto_id as string)))
    setLoadingPostos(false)
  }

  async function openPostoGerenteModal(u: Usuario) {
    setSelected(u)
    setLoadingPostoGerente(true)
    setOpenPostoGerente(true)
    setPostoGerenteSel((u as any).posto_fechamento_id ?? '')

    const { data } = await supabase
      .from('postos')
      .select('id, nome')
      .eq('empresa_id', u.empresa_id)
      .order('nome')

    setPostosGerente((data ?? []) as Pick<Posto, 'id' | 'nome'>[])
    setLoadingPostoGerente(false)
  }

  async function handleSavePostoGerente() {
    if (!selected) return
    setSavingPostoGerente(true)
    try {
      await supabase
        .from('usuarios')
        .update({ posto_fechamento_id: postoGerenteSel || null })
        .eq('id', selected.id)
      await load()
      setOpenPostoGerente(false)
    } finally {
      setSavingPostoGerente(false)
    }
  }

  async function handleSavePostos() {
    if (!selected) return
    setSavingPostos(true)

    await supabase
      .from('tarefas_recorrentes')
      .update({ ativo: false })
      .eq('usuario_id', selected.id)
      .is('posto_id', null)

    const { data: existentes } = await supabase
      .from('tarefas_recorrentes')
      .select('id, posto_id, ativo')
      .eq('usuario_id', selected.id)
      .not('posto_id', 'is', null)

    const existentesMap = new Map<string, { id: string; ativo: boolean }>(
      (existentes ?? []).map(r => [r.posto_id as string, { id: r.id, ativo: r.ativo }])
    )

    const ops: Promise<unknown>[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any

    for (const posto of postosEmpresa) {
      const existe = existentesMap.get(posto.id)
      const marcado = postosAtivos.has(posto.id)

      if (marcado && !existe) {
        ops.push(
          (supabase.from('tarefas_recorrentes').insert({
            empresa_id:     selected.empresa_id,
            usuario_id:     selected.id,
            posto_id:       posto.id,
            titulo:         `Conciliação Bancária — ${posto.nome}`,
            descricao:      `Conciliar os lançamentos bancários do posto ${posto.nome}.`,
            categoria:      'conciliacao_bancaria',
            prioridade:     'alta',
            carencia_dias:  4,
            tolerancia_dias: 1,
            ativo:          true,
          }) as unknown) as Promise<unknown>
        )
      } else if (marcado && existe && !existe.ativo) {
        ops.push((supabase.from('tarefas_recorrentes').update({ ativo: true }).eq('id', existe.id) as unknown) as Promise<unknown>)
      } else if (!marcado && existe && existe.ativo) {
        ops.push((supabase.from('tarefas_recorrentes').update({ ativo: false }).eq('id', existe.id) as unknown) as Promise<unknown>)
      }
    }

    await Promise.all(ops)
    await supabase.rpc('fix_tarefas_apos_troca_posto')

    toast({ title: 'Postos atualizados!', description: `${postosAtivos.size} posto(s) ativo(s) para ${selected.nome}.` })
    setSavingPostos(false)
    setOpenPostos(false)
  }

  async function handleSave() {
    if (!form.nome.trim() || !form.email.trim()) {
      toast({ variant: 'destructive', title: 'Nome e email são obrigatórios' })
      return
    }
    if (!selected && !form.senha.trim()) {
      toast({ variant: 'destructive', title: 'Senha obrigatória para novo usuário' })
      return
    }
    setSaving(true)

    if (selected) {
      // Define posto_fechamento_id como o primeiro da seleção (ou o único para gerente)
      const postoFechamento = form.role === 'operador_caixa'
        ? (postosCaixaSel.size > 0 ? Array.from(postosCaixaSel)[0] : null)
        : form.role === 'gerente' ? (form.posto_fechamento_id || null) : null

      const { error } = await supabase
        .from('usuarios')
        .update({
          nome: form.nome,
          role: form.role,
          empresa_id: form.empresa_id || null,
          posto_fechamento_id: postoFechamento,
          perfil_id: form.perfil_id || null,
        })
        .eq('id', selected.id)

      // Atualiza vínculos de postos para operador_caixa
      if (!error && form.role === 'operador_caixa') {
        await supabase.from('usuario_postos_caixa').delete().eq('usuario_id', selected.id)
        if (postosCaixaSel.size > 0) {
          await supabase.from('usuario_postos_caixa').insert(
            Array.from(postosCaixaSel).map(pid => ({ usuario_id: selected.id, posto_id: pid }))
          )
        }
      }

      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao atualizar', description: error.message })
      } else {
        toast({ title: 'Usuário atualizado!' })
        setOpenForm(false)
        load()
      }
    } else {
      const postoFechamento = form.role === 'operador_caixa'
        ? (postosCaixaSel.size > 0 ? Array.from(postosCaixaSel)[0] : null)
        : form.role === 'gerente' ? (form.posto_fechamento_id || null) : null

      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: form.nome,
          email: form.email,
          senha: form.senha,
          role: form.role,
          empresa_id: form.empresa_id || null,
          posto_fechamento_id: postoFechamento,
          postos_caixa: form.role === 'operador_caixa' ? Array.from(postosCaixaSel) : [],
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ variant: 'destructive', title: 'Erro ao criar', description: data.error })
      } else {
        toast({ title: 'Usuário criado!' })
        setOpenForm(false)
        load()
      }
    }
    setSaving(false)
  }

  async function handleResetSenha() {
    if (!selected) return
    if (novaSenha.length < 6) {
      toast({ variant: 'destructive', title: 'Senha muito curta', description: 'Mínimo 6 caracteres.' }); return
    }
    setSavingReset(true)
    const res = await fetch('/api/usuarios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: selected.id, novaSenha }),
    })
    const data = await res.json()
    if (!res.ok) {
      toast({ variant: 'destructive', title: 'Erro ao redefinir senha', description: data.error })
    } else {
      toast({ title: 'Senha redefinida!', description: `Senha de "${selected.nome}" atualizada com sucesso.` })
      setOpenReset(false)
      setNovaSenha('')
    }
    setSavingReset(false)
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    const res = await fetch('/api/usuarios', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: selected.id }),
    })
    const data = await res.json()
    if (!res.ok) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: data.error })
    } else {
      toast({ title: 'Usuário excluído!' })
      setOpenDelete(false)
      load()
    }
    setDeleting(false)
  }

  const availableRoles: Role[] = role === 'master'
    ? ['master', 'adm_financeiro', 'adm_fiscal', 'adm_marketing', 'adm_transpombal', 'adm_contas_pagar', 'operador_caixa', 'operador_conciliador', 'gerente']
    : ['adm_financeiro', 'adm_fiscal', 'adm_marketing', 'adm_transpombal', 'adm_contas_pagar', 'operador_caixa', 'operador_conciliador', 'gerente']

  const columns: ColumnDef<Usuario>[] = [
    {
      accessorKey: 'nome',
      header: 'Usuário',
      cell: ({ row }) => {
        const u = row.original
        const initials = u.nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
        return (
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
              {initials}
            </div>
            <div>
              <p className="font-medium text-gray-900 text-[13px]">{u.nome}</p>
              <p className="text-[11px] text-gray-400">{u.email}</p>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: 'role',
      header: 'Perfil',
      cell: ({ row }) => (
        <span className={cn(
          'text-[11px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wide',
          getRoleColor(row.original.role)
        )}>
          {getRoleLabel(row.original.role)}
        </span>
      ),
    },
    ...(role === 'master' ? [{
      id: 'empresa',
      header: 'Empresa',
      accessorFn: (row: Usuario) => (row as { empresa?: { nome: string } }).empresa?.nome ?? '—',
      cell: ({ getValue }: { getValue: () => unknown }) => (
        <span className="text-[13px] text-gray-600">{getValue() as string}</span>
      ),
    } as ColumnDef<Usuario>] : []),
    {
      id: 'posto',
      header: 'Posto',
      cell: ({ row }) => {
        const u = row.original
        if (u.role !== 'gerente') return <span className="text-[12px] text-gray-300">—</span>
        const postoNome = (u as any).posto_fechamento_id
          ? todosPostos.find(p => p.id === (u as any).posto_fechamento_id)?.nome ?? '—'
          : null
        return postoNome ? (
          <div className="flex items-center gap-1 text-[12px] text-gray-600">
            <MapPin className="w-3 h-3 text-teal-500 shrink-0" />
            {postoNome}
          </div>
        ) : (
          <span className="text-[11px] text-orange-500 italic">Não vinculado</span>
        )
      },
    },
    {
      accessorKey: 'ativo',
      header: 'Status',
      cell: ({ row }) => <AtivoInativoBadge ativo={row.original.ativo} />,
    },
    {
      accessorKey: 'criado_em',
      header: 'Criado em',
      cell: ({ row }) => <span className="text-[12px] text-gray-500">{formatDate(row.original.criado_em)}</span>,
    },
    {
      id: 'acoes',
      header: '',
      cell: ({ row }) => {
        const u = row.original
        const isSelf = u.id === usuario?.id
        const temRecorrentes = comRecorrentes.has(u.id)
        return (
          <div className="flex items-center gap-1 justify-end">
            {/* Botão ver detalhes — sempre visível para admin/master */}
            {can(role ?? null, 'usuarios.view') && (
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
                onClick={() => openVerDetalhe(u)}
                title="Ver perfil e permissões"
              >
                <Eye className="w-3.5 h-3.5" />
              </Button>
            )}
            {/* Botão postos — conciliador */}
            {temRecorrentes && can(role ?? null, 'usuarios.edit') && (
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 text-gray-400 hover:text-cyan-600 hover:bg-cyan-50"
                onClick={() => openGerenciarPostos(u)}
                title="Configurar postos"
              >
                <MapPin className="w-3.5 h-3.5" />
              </Button>
            )}
            {/* Botão posto — gerente */}
            {u.role === 'gerente' && can(role ?? null, 'usuarios.edit') && (
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 text-gray-400 hover:text-teal-600 hover:bg-teal-50"
                onClick={() => openPostoGerenteModal(u)}
                title="Definir posto do gerente"
              >
                <MapPin className="w-3.5 h-3.5" />
              </Button>
            )}
            {!isSelf && can(role ?? null, 'usuarios.edit') && (
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                onClick={() => openEdit(u)}
                title="Editar"
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            )}
            {!isSelf && role === 'master' && (
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 text-gray-400 hover:text-orange-600 hover:bg-orange-50"
                onClick={() => { setSelected(u); setNovaSenha(''); setShowNovaSenha(false); setOpenReset(true) }}
                title="Redefinir senha"
              >
                <KeyRound className="w-3.5 h-3.5" />
              </Button>
            )}
            {!isSelf && can(role ?? null, 'usuarios.delete') && (
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50"
                onClick={() => { setSelected(u); setOpenDelete(true) }}
                title="Excluir"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
            {isSelf && (
              <span className="text-[11px] text-gray-400 px-2">Você</span>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="animate-fade-in">
      <Header
        title="Usuários"
        description="Gerencie os usuários com acesso ao sistema"
        actions={
          <PermissionGuard permission="usuarios.create">
            <Button onClick={openCreate} className="h-9 bg-orange-500 hover:bg-orange-600 text-[13px] gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              <span className="btn-text">Novo Usuário</span>
            </Button>
          </PermissionGuard>
        }
      />

      <div className="p-3 md:p-6">
        <DataTable
          columns={columns}
          data={usuarios}
          loading={loading}
          searchPlaceholder="Buscar por nome, email..."
        />
      </div>

      {/* ── Painel de detalhes do usuário ─────────────────────────────── */}
      <Dialog open={openDetalhe} onOpenChange={setOpenDetalhe}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              {selected && (
                <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {selected.nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
                </div>
              )}
              <div>
                <DialogTitle className="text-base">{selected?.nome}</DialogTitle>
                <p className="text-[12px] text-gray-400 mt-0.5">{selected?.email}</p>
              </div>
              {selected && (
                <span className={cn(
                  'ml-auto text-[11px] font-semibold px-2.5 py-1 rounded-md uppercase tracking-wide',
                  getRoleColor(selected.role)
                )}>
                  {getRoleLabel(selected.role)}
                </span>
              )}
            </div>
          </DialogHeader>

          {loadingDetalhe ? (
            <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-[13px]">Carregando dados...</span>
            </div>
          ) : detalheStats && selected ? (
            <div className="space-y-5 py-1">

              {/* Informações básicas */}
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <div className="bg-gray-50 rounded-lg px-3 py-2.5">
                  <span className="text-gray-400 block mb-0.5">Status</span>
                  <span className={cn('font-semibold', selected.ativo ? 'text-green-700' : 'text-red-600')}>
                    {selected.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div className="bg-gray-50 rounded-lg px-3 py-2.5">
                  <span className="text-gray-400 block mb-0.5">Cadastrado em</span>
                  <span className="font-medium text-gray-700">{formatDate(selected.criado_em)}</span>
                </div>
              </div>

              {/* Perfil customizado ativo */}
              {selected.perfil_id && selected.perfil && (
                <div className="flex items-center gap-2.5 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2.5">
                  <Info className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                  <div>
                    <p className="text-[12px] font-semibold text-indigo-800">Perfil customizado ativo: {(selected.perfil as PerfilPermissoes).nome}</p>
                    <p className="text-[11px] text-indigo-500">{(selected.perfil as PerfilPermissoes).permissoes.length} permissões — substituindo as do cargo padrão</p>
                  </div>
                </div>
              )}

              {/* Cards de estatísticas */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <ClipboardList className="w-3.5 h-3.5" />
                  Histórico de Tarefas
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Total', value: detalheStats.totalTarefas, color: 'bg-gray-100 text-gray-700' },
                    { label: 'Em aberto', value: detalheStats.abertas, color: 'bg-yellow-50 text-yellow-700' },
                    { label: 'Concluídas', value: detalheStats.concluidas, color: 'bg-green-50 text-green-700' },
                    { label: 'Canceladas', value: detalheStats.canceladas, color: 'bg-red-50 text-red-600' },
                  ].map(stat => (
                    <div key={stat.label} className={cn('rounded-lg px-3 py-2.5 text-center', stat.color)}>
                      <p className="text-xl font-bold">{stat.value}</p>
                      <p className="text-[11px] mt-0.5">{stat.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tarefas recorrentes / postos (conciliador) */}
              {selected.role === 'operador_conciliador' && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5" />
                    Postos Vinculados ({detalheStats.postos.length})
                  </p>
                  {detalheStats.postos.length === 0 ? (
                    <p className="text-[12px] text-gray-400 italic">Nenhum posto vinculado.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {detalheStats.postos.map(nome => (
                        <span key={nome} className="inline-flex items-center gap-1 text-[11px] bg-cyan-50 text-cyan-700 border border-cyan-200 rounded-full px-2.5 py-1 font-medium">
                          <MapPin className="w-3 h-3" />
                          {nome}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Matriz de permissões */}
              <div>
                {(() => {
                  const perfilCustom = selected.perfil_id ? (selected.perfil as PerfilPermissoes | null) : null
                  const permissoesCustom = perfilCustom?.permissoes ?? null
                  const titulo = perfilCustom ? `Permissões do Perfil — ${perfilCustom.nome}` : `Permissões do Cargo — ${getRoleLabel(selected.role)}`
                  return (
                    <>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5" />
                        {titulo}
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {PERM_GRUPOS.map(grupo => (
                          <div key={grupo.label} className="border border-gray-100 rounded-lg overflow-hidden">
                            <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-100">
                              <p className="text-[11px] font-semibold text-gray-600">{grupo.label}</p>
                            </div>
                            <div className="divide-y divide-gray-50">
                              {grupo.items.map(item => {
                                const temAcesso = permissoesCustom != null
                                  ? permissoesCustom.includes(item.key)
                                  : (PERMISSIONS[item.key as keyof typeof PERMISSIONS] as readonly string[] | undefined)?.includes(selected.role) ?? false
                                return (
                                  <div key={item.key} className="flex items-center justify-between px-3 py-1.5">
                                    <span className="text-[11px] text-gray-600">{item.label}</span>
                                    {temAcesso ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                                    ) : (
                                      <XCircle className="w-3.5 h-3.5 text-gray-200 flex-shrink-0" />
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )
                })()}
              </div>

            </div>
          ) : null}

          <DialogFooter className="mt-2">
            {selected && can(role ?? null, 'usuarios.edit') && selected.id !== usuario?.id && (
              <Button
                variant="outline"
                className="mr-auto text-[12px] h-8"
                onClick={() => { setOpenDetalhe(false); openEdit(selected) }}
              >
                <Pencil className="w-3 h-3 mr-1.5" />
                Editar usuário
              </Button>
            )}
            <Button variant="outline" className="h-8 text-[12px]" onClick={() => setOpenDetalhe(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal criar/editar */}
      <Dialog open={openForm} onOpenChange={open => { if (!saving) setOpenForm(open) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                <UserCircle className="w-4 h-4 text-orange-600" />
              </div>
              <DialogTitle>{selected ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Nome completo *</Label>
              <Input
                value={form.nome}
                onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                placeholder="Nome do usuário"
                autoFocus
              />
            </div>
            {!selected && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-[12px] font-medium text-gray-600">Email *</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="usuario@exemplo.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[12px] font-medium text-gray-600">Senha *</Label>
                  <div className="relative">
                    <Input
                      type={showPass ? 'text' : 'password'}
                      value={form.senha}
                      onChange={e => setForm(p => ({ ...p, senha: e.target.value }))}
                      placeholder="Mínimo 6 caracteres"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Perfil de acesso</Label>
              <Select
                value={form.role}
                onValueChange={v => {
                  const newRole = v as Role
                  setForm(p => ({ ...p, role: newRole, posto_fechamento_id: '' }))
                  if (newRole === 'operador_caixa' || newRole === 'gerente') {
                    const empId = form.empresa_id || usuario?.empresa_id || ''
                    loadPostosParaFechador(empId)
                  } else {
                    setPostosForm([])
                  }
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableRoles.map(r => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Aviso ao trocar perfil em edição */}
              {selected && form.role !== selected.role && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    O perfil será alterado de <strong>{getRoleLabel(selected.role)}</strong> para <strong>{getRoleLabel(form.role)}</strong>.
                    As tarefas já criadas e atribuídas a este usuário permanecerão normalmente.
                  </p>
                </div>
              )}
            </div>
            {/* Perfil customizado — sobrepõe permissões do cargo */}
            {perfis.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Perfil de permissões customizado</Label>
                <Select
                  value={form.perfil_id || '__none__'}
                  onValueChange={v => setForm(p => ({ ...p, perfil_id: v === '__none__' ? '' : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Usar permissões do cargo padrão" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Usar cargo padrão ({getRoleLabel(form.role)})</SelectItem>
                    {perfis.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.perfil_id && (
                  <p className="text-[11px] text-indigo-600">
                    As permissões do perfil customizado substituirão as do cargo.
                  </p>
                )}
              </div>
            )}

            {role === 'master' && (
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Empresa</Label>
                <Select
                  value={form.empresa_id}
                  onValueChange={v => {
                    setForm(p => ({ ...p, empresa_id: v, posto_fechamento_id: '' }))
                    if (form.role === 'operador_caixa') loadPostosParaFechador(v)
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                  <SelectContent>
                    {empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.role === 'operador_caixa' && (
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">
                  Postos responsáveis <span className="text-red-500">*</span>
                  {postosCaixaSel.size > 0 && (
                    <span className="ml-1.5 text-orange-600">({postosCaixaSel.size} selecionado{postosCaixaSel.size > 1 ? 's' : ''})</span>
                  )}
                </Label>
                {postosForm.length === 0 ? (
                  <p className="text-[12px] text-gray-400 italic">
                    {form.empresa_id ? 'Nenhum posto encontrado para esta empresa.' : 'Selecione a empresa primeiro.'}
                  </p>
                ) : (
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                    {postosForm.map(p => (
                      <label key={p.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-orange-50 transition-colors">
                        <input
                          type="checkbox"
                          checked={postosCaixaSel.has(p.id)}
                          onChange={() => setPostosCaixaSel(prev => {
                            const next = new Set(prev)
                            if (next.has(p.id)) next.delete(p.id)
                            else next.add(p.id)
                            return next
                          })}
                          className="rounded border-gray-300 text-orange-500 accent-orange-500"
                        />
                        <span className="text-[13px] text-gray-700">{p.nome}</span>
                      </label>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-gray-400">Pode selecionar múltiplos postos. O operador verá e enviará fechamentos de todos eles.</p>
              </div>
            )}
            {form.role === 'gerente' && (
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">
                  Posto do gerente <span className="text-red-500">*</span>
                </Label>
                {postosForm.length === 0 ? (
                  <p className="text-[12px] text-gray-400 italic">
                    {form.empresa_id ? 'Nenhum posto encontrado para esta empresa.' : 'Selecione a empresa primeiro.'}
                  </p>
                ) : (
                  <Select
                    value={form.posto_fechamento_id}
                    onValueChange={v => setForm(p => ({ ...p, posto_fechamento_id: v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione o posto..." /></SelectTrigger>
                    <SelectContent>
                      {postosForm.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-[11px] text-gray-400">O gerente verá somente os tanques e medições do posto selecionado.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenForm(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-orange-500 hover:bg-orange-600 min-w-[90px]">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : selected ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal postos do conciliador */}
      <Dialog open={openPostos} onOpenChange={open => { if (!savingPostos) setOpenPostos(open) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center">
                <MapPin className="w-4 h-4 text-cyan-600" />
              </div>
              <div>
                <DialogTitle>Postos do Conciliador</DialogTitle>
                {selected && (
                  <p className="text-[12px] text-gray-400 mt-0.5">{selected.nome}</p>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="py-1">
            <p className="text-[12px] text-gray-500 mb-3">
              Selecione os postos que este conciliador é responsável por conciliar. Uma tarefa diária será gerada automaticamente para cada posto marcado.
            </p>

            {loadingPostos ? (
              <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-[13px]">Carregando postos...</span>
              </div>
            ) : postosEmpresa.length === 0 ? (
              <p className="text-[13px] text-gray-400 text-center py-6">Nenhum posto cadastrado para esta empresa.</p>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {postosEmpresa.map(posto => {
                  const checked = postosAtivos.has(posto.id)
                  return (
                    <label
                      key={posto.id}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors',
                        checked ? 'bg-cyan-50 border border-cyan-200' : 'hover:bg-gray-50 border border-transparent'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => {
                          const next = new Set(postosAtivos)
                          if (e.target.checked) next.add(posto.id)
                          else next.delete(posto.id)
                          setPostosAtivos(next)
                        }}
                        className="w-4 h-4 rounded accent-cyan-600"
                      />
                      <div className="flex items-center gap-2 min-w-0">
                        <MapPin className={cn('w-3.5 h-3.5 flex-shrink-0', checked ? 'text-cyan-600' : 'text-gray-400')} />
                        <span className={cn('text-[13px] truncate', checked ? 'font-medium text-gray-800' : 'text-gray-600')}>
                          {posto.nome}
                        </span>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}

            {postosEmpresa.length > 0 && (
              <p className="text-[11px] text-gray-400 mt-3">
                {postosAtivos.size} de {postosEmpresa.length} posto(s) selecionado(s)
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenPostos(false)} disabled={savingPostos}>Cancelar</Button>
            <Button
              onClick={handleSavePostos}
              disabled={savingPostos || loadingPostos}
              className="bg-cyan-600 hover:bg-cyan-700 min-w-[90px]"
            >
              {savingPostos ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal posto do gerente */}
      <Dialog open={openPostoGerente} onOpenChange={open => { if (!savingPostoGerente) setOpenPostoGerente(open) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center">
                <MapPin className="w-4 h-4 text-teal-600" />
              </div>
              <div>
                <DialogTitle>Posto do Gerente</DialogTitle>
                {selected && <p className="text-[12px] text-gray-400 mt-0.5">{selected.nome}</p>}
              </div>
            </div>
          </DialogHeader>

          <div className="py-1">
            <p className="text-[12px] text-gray-500 mb-3">
              Selecione o posto que este gerente é responsável. Ele só poderá criar solicitações de marketing para este posto.
            </p>

            {loadingPostoGerente ? (
              <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-[13px]">Carregando postos...</span>
              </div>
            ) : postosGerente.length === 0 ? (
              <p className="text-[13px] text-gray-400 text-center py-6">Nenhum posto cadastrado para esta empresa.</p>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {/* Opção nenhum */}
                <label className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors',
                  postoGerenteSel === '' ? 'bg-gray-100 border border-gray-300' : 'hover:bg-gray-50 border border-transparent'
                )}>
                  <input
                    type="radio"
                    name="posto-gerente"
                    checked={postoGerenteSel === ''}
                    onChange={() => setPostoGerenteSel('')}
                    className="w-4 h-4 accent-teal-600"
                  />
                  <span className="text-[13px] text-gray-400 italic">— Nenhum posto vinculado</span>
                </label>
                {postosGerente.map(posto => (
                  <label key={posto.id} className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors',
                    postoGerenteSel === posto.id
                      ? 'bg-teal-50 border border-teal-200'
                      : 'hover:bg-gray-50 border border-transparent'
                  )}>
                    <input
                      type="radio"
                      name="posto-gerente"
                      checked={postoGerenteSel === posto.id}
                      onChange={() => setPostoGerenteSel(posto.id)}
                      className="w-4 h-4 accent-teal-600"
                    />
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin className={cn('w-3.5 h-3.5 flex-shrink-0', postoGerenteSel === posto.id ? 'text-teal-600' : 'text-gray-400')} />
                      <span className={cn('text-[13px] truncate', postoGerenteSel === posto.id ? 'font-medium text-gray-800' : 'text-gray-600')}>
                        {posto.nome}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenPostoGerente(false)} disabled={savingPostoGerente}>Cancelar</Button>
            <Button
              onClick={handleSavePostoGerente}
              disabled={savingPostoGerente || loadingPostoGerente}
              className="bg-teal-600 hover:bg-teal-700 min-w-[90px]"
            >
              {savingPostoGerente ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal redefinir senha */}
      <Dialog open={openReset} onOpenChange={open => { if (!savingReset) { setOpenReset(open); if (!open) setNovaSenha('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                <KeyRound className="w-4 h-4 text-orange-600" />
              </div>
              <DialogTitle>Redefinir Senha</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="px-3 py-2 bg-gray-50 rounded-lg text-[12px] text-gray-600">
              Usuário: <strong>{selected?.nome}</strong>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Nova Senha *</Label>
              <div className="relative">
                <Input
                  type={showNovaSenha ? 'text' : 'password'}
                  value={novaSenha}
                  onChange={e => setNovaSenha(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="pr-10"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowNovaSenha(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showNovaSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenReset(false)} disabled={savingReset}>Cancelar</Button>
            <Button onClick={handleResetSenha} disabled={savingReset} className="bg-orange-500 hover:bg-orange-600 min-w-[90px]">
              {savingReset ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Redefinir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={openDelete}
        onOpenChange={open => { if (!deleting) setOpenDelete(open) }}
        title="Excluir usuário"
        description={`Tem certeza que deseja excluir "${selected?.nome}"? O usuário perderá acesso ao sistema imediatamente.`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  )
}
