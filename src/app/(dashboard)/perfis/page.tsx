'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { toast } from '@/hooks/use-toast'
import { useAuthContext } from '@/contexts/AuthContext'
import { PERMISSIONS, ROLE_LABELS, ROLE_COLORS } from '@/lib/utils/permissions'
import { cn } from '@/lib/utils/cn'
import {
  Plus, Pencil, Trash2, Loader2, ShieldCheck, Users, CheckCircle2,
  XCircle, Lock, LayoutDashboard, Building2, MapPin, ClipboardList,
  Globe, Monitor, Banknote, FileBarChart2, Megaphone, Search,
  CreditCard, ChevronDown, ChevronUp, RotateCcw,
} from 'lucide-react'
import type { PerfilPermissoes, Role } from '@/types/database.types'

// ─── Cargos fixos ─────────────────────────────────────────────────────────────
const ROLES_SISTEMA: { role: Role; cor: string }[] = [
  { role: 'master',      cor: 'bg-purple-100 text-purple-700 border-purple-200' },
  { role: 'admin',       cor: 'bg-blue-100 text-blue-700 border-blue-200' },
  { role: 'operador',    cor: 'bg-green-100 text-green-700 border-green-200' },
  { role: 'conciliador', cor: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  { role: 'fechador',    cor: 'bg-orange-100 text-orange-700 border-orange-200' },
  { role: 'marketing',   cor: 'bg-pink-100 text-pink-700 border-pink-200' },
  { role: 'gerente',     cor: 'bg-teal-100 text-teal-700 border-teal-200' },
]

// ─── Grupos de permissões completos ───────────────────────────────────────────
const PERM_GRUPOS = [
  {
    label: 'Dashboard & Relatórios',
    icon: LayoutDashboard,
    color: 'text-blue-600 bg-blue-50',
    items: [
      { label: 'Ver Dashboard principal',     key: 'dashboard.view' },
      { label: 'Ver Analítico',               key: 'analitico.view' },
      { label: 'Ver Relatórios',              key: 'relatorios.view' },
      { label: 'Relatório de Conciliação',    key: 'relatorios.conciliacao' },
    ],
  },
  {
    label: 'Usuários & Empresas',
    icon: Users,
    color: 'text-violet-600 bg-violet-50',
    items: [
      { label: 'Ver usuários',       key: 'usuarios.view' },
      { label: 'Criar usuários',     key: 'usuarios.create' },
      { label: 'Editar usuários',    key: 'usuarios.edit' },
      { label: 'Excluir usuários',   key: 'usuarios.delete' },
      { label: 'Ver empresas',       key: 'empresas.view' },
      { label: 'Criar empresas',     key: 'empresas.create' },
      { label: 'Editar empresas',    key: 'empresas.edit' },
      { label: 'Excluir empresas',   key: 'empresas.delete' },
    ],
  },
  {
    label: 'Postos',
    icon: MapPin,
    color: 'text-orange-600 bg-orange-50',
    items: [
      { label: 'Ver postos',     key: 'postos.view' },
      { label: 'Criar postos',   key: 'postos.create' },
      { label: 'Editar postos',  key: 'postos.edit' },
      { label: 'Excluir postos', key: 'postos.delete' },
    ],
  },
  {
    label: 'Tarefas',
    icon: ClipboardList,
    color: 'text-amber-600 bg-amber-50',
    items: [
      { label: 'Ver tarefas',                    key: 'tarefas.view' },
      { label: 'Criar tarefas',                  key: 'tarefas.create' },
      { label: 'Editar tarefas',                 key: 'tarefas.edit' },
      { label: 'Excluir tarefas',                key: 'tarefas.delete' },
      { label: 'Ver tarefas recorrentes',        key: 'tarefas_recorrentes.view' },
      { label: 'Criar tarefas recorrentes',      key: 'tarefas_recorrentes.create' },
      { label: 'Editar tarefas recorrentes',     key: 'tarefas_recorrentes.edit' },
      { label: 'Excluir tarefas recorrentes',    key: 'tarefas_recorrentes.delete' },
    ],
  },
  {
    label: 'Portais & Acessos',
    icon: Globe,
    color: 'text-cyan-600 bg-cyan-50',
    items: [
      { label: 'Ver portais',              key: 'portais.view' },
      { label: 'Criar portais',            key: 'portais.create' },
      { label: 'Editar portais',           key: 'portais.edit' },
      { label: 'Excluir portais',          key: 'portais.delete' },
      { label: 'Ver acessos',              key: 'acessos.view' },
      { label: 'Criar acessos',            key: 'acessos.create' },
      { label: 'Editar acessos',           key: 'acessos.edit' },
      { label: 'Editar senhas de acessos', key: 'acessos.edit_senha' },
      { label: 'Excluir acessos',          key: 'acessos.delete' },
    ],
  },
  {
    label: 'Equipamentos & TI',
    icon: Monitor,
    color: 'text-slate-600 bg-slate-50',
    items: [
      { label: 'Ver maquininhas',          key: 'maquininhas.view' },
      { label: 'Criar maquininhas',        key: 'maquininhas.create' },
      { label: 'Editar maquininhas',       key: 'maquininhas.edit' },
      { label: 'Excluir maquininhas',      key: 'maquininhas.delete' },
      { label: 'Ver AnyDesk',              key: 'anydesk.view' },
      { label: 'Criar AnyDesk',            key: 'anydesk.create' },
      { label: 'Editar AnyDesk',           key: 'anydesk.edit' },
      { label: 'Excluir AnyDesk',          key: 'anydesk.delete' },
      { label: 'Ver servidores',           key: 'servidores.view' },
      { label: 'Criar servidores',         key: 'servidores.create' },
      { label: 'Editar servidores',        key: 'servidores.edit' },
      { label: 'Excluir servidores',       key: 'servidores.delete' },
      { label: 'Ver câmeras',              key: 'cameras.view' },
      { label: 'Criar câmeras',            key: 'cameras.create' },
      { label: 'Editar câmeras',           key: 'cameras.edit' },
      { label: 'Excluir câmeras',          key: 'cameras.delete' },
      { label: 'Ver bobinas/solicitações', key: 'bobinas.view' },
      { label: 'Criar solicitações',       key: 'bobinas.create' },
      { label: 'Excluir solicitações',     key: 'bobinas.delete' },
    ],
  },
  {
    label: 'Financeiro — Conciliação',
    icon: Banknote,
    color: 'text-emerald-600 bg-emerald-50',
    items: [
      { label: 'Painel de Extrato Bancário',       key: 'extrato_painel.view' },
      { label: 'Ver Contas a Receber (AS)',         key: 'contas_receber.view' },
      { label: 'Ver contas bancárias',              key: 'contas_bancarias.view' },
      { label: 'Criar contas bancárias',            key: 'contas_bancarias.create' },
      { label: 'Editar contas bancárias',           key: 'contas_bancarias.edit' },
      { label: 'Excluir contas bancárias',          key: 'contas_bancarias.delete' },
      { label: 'Controle de Caixas (ver)',          key: 'controle_caixas.view' },
      { label: 'Controle de Caixas (configurar)',   key: 'controle_caixas.configurar' },
      { label: 'Ver taxas',                         key: 'taxas.view' },
      { label: 'Criar taxas',                       key: 'taxas.create' },
      { label: 'Editar taxas',                      key: 'taxas.edit' },
      { label: 'Excluir taxas',                     key: 'taxas.delete' },
      { label: 'Ver adquirentes',                   key: 'adquirentes.view' },
      { label: 'Criar adquirentes',                 key: 'adquirentes.create' },
      { label: 'Editar adquirentes',                key: 'adquirentes.edit' },
      { label: 'Excluir adquirentes',               key: 'adquirentes.delete' },
      { label: 'Ver senhas TEF',                    key: 'senhas_tef.view' },
      { label: 'Criar/editar senhas TEF',           key: 'senhas_tef.create' },
      { label: 'Excluir senhas TEF',                key: 'senhas_tef.delete' },
    ],
  },
  {
    label: 'Contas a Pagar',
    icon: CreditCard,
    color: 'text-rose-600 bg-rose-50',
    items: [
      { label: 'Ver Contas a Pagar',            key: 'contas_pagar.view' },
      { label: 'Lançar contas a pagar',         key: 'contas_pagar.lancar' },
      { label: 'Reconciliar contas a pagar',    key: 'contas_pagar.reconciliar' },
      { label: 'Ver despesas fixas',            key: 'contas_pagar.fixas.view' },
      { label: 'Editar despesas fixas',         key: 'contas_pagar.fixas.edit' },
      { label: 'Gerar mês (despesas fixas)',    key: 'contas_pagar.gerar_mes' },
      { label: 'Marcar como pago',              key: 'contas_pagar.marcar_pago' },
    ],
  },
  {
    label: 'Marketing',
    icon: Megaphone,
    color: 'text-pink-600 bg-pink-50',
    items: [
      { label: 'Acessar módulo de Marketing',    key: 'marketing.view' },
      { label: 'Criar patrocínios',               key: 'marketing.create_patrocinio' },
      { label: 'Anexar documentos',               key: 'marketing.anexar_documento' },
      { label: 'Ver ações de Marketing',          key: 'marketing.ver_acoes' },
      { label: 'Aprovar solicitações',            key: 'marketing.aprovar' },
      { label: 'Criar ações de Marketing',        key: 'marketing.create_acao' },
      { label: 'Conciliação de Marketing',        key: 'marketing.conciliacao' },
      { label: 'Configurações de Marketing',      key: 'marketing.config' },
    ],
  },
  {
    label: 'Auditoria',
    icon: FileBarChart2,
    color: 'text-gray-600 bg-gray-100',
    items: [
      { label: 'Ver logs de auditoria', key: 'audit.view' },
    ],
  },
] as const

type PermKey = string
const ALL_KEYS = PERM_GRUPOS.flatMap(g => g.items.map(i => i.key))

const EMPTY_FORM = { nome: '', descricao: '', permissoes: [] as string[] }

// ─── helpers ──────────────────────────────────────────────────────────────────
function resolvePerms(role: Role, overrides: Record<string, string[]>): string[] {
  return overrides[role] ?? Object.entries(PERMISSIONS)
    .filter(([, roles]) => (roles as readonly string[]).includes(role))
    .map(([key]) => key)
}

export default function PerfisPage() {
  const { usuario, refreshPermissions } = useAuthContext()
  const supabase = createClient()

  const [perfis,        setPerfis]        = useState<(PerfilPermissoes & { _qtdUsuarios?: number })[]>([])
  const [roleOverrides, setRoleOverrides] = useState<Record<string, string[]>>({})
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [deleting,      setDeleting]      = useState(false)

  const [openForm,      setOpenForm]      = useState(false)
  const [openDelete,    setOpenDelete]    = useState(false)
  const [openReset,     setOpenReset]     = useState(false)
  const [selected,      setSelected]      = useState<PerfilPermissoes | null>(null)
  const [editingRole,   setEditingRole]   = useState<Role | null>(null)
  const [resettingRole, setResettingRole] = useState<Role | null>(null)
  const [form,          setForm]          = useState(EMPTY_FORM)
  const [busca,         setBusca]         = useState('')
  const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(new Set(PERM_GRUPOS.map(g => g.label)))

  async function load() {
    setLoading(true)
    let query = supabase.from('perfis_permissoes').select('*').order('nome')
    if (usuario?.empresa_id) query = query.eq('empresa_id', usuario.empresa_id)
    const { data } = await query

    if (data) {
      const { data: usPerfis } = await supabase
        .from('usuarios').select('perfil_id').not('perfil_id', 'is', null)
      const contagem: Record<string, number> = {}
      for (const u of usPerfis ?? []) {
        if (u.perfil_id) contagem[u.perfil_id] = (contagem[u.perfil_id] ?? 0) + 1
      }

      const overrides: Record<string, string[]> = {}
      const customPerfis = data.filter(p => {
        const pp = p as PerfilPermissoes & { is_role_override?: boolean; role_override?: string }
        if (pp.is_role_override && pp.role_override) {
          overrides[pp.role_override] = p.permissoes
          return false
        }
        return true
      })
      setRoleOverrides(overrides)
      setPerfis(customPerfis.map(p => ({ ...p, _qtdUsuarios: contagem[p.id] ?? 0 })))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [usuario?.empresa_id])

  function openCreate() {
    setSelected(null); setEditingRole(null)
    setForm(EMPTY_FORM); setBusca('')
    setGruposAbertos(new Set(PERM_GRUPOS.map(g => g.label)))
    setOpenForm(true)
  }

  function openEdit(p: PerfilPermissoes) {
    setSelected(p); setEditingRole(null)
    setForm({ nome: p.nome, descricao: p.descricao ?? '', permissoes: [...p.permissoes] })
    setBusca(''); setGruposAbertos(new Set(PERM_GRUPOS.map(g => g.label)))
    setOpenForm(true)
  }

  function openEditRole(r: Role) {
    setSelected(null); setEditingRole(r)
    setForm({ nome: ROLE_LABELS[r], descricao: '', permissoes: resolvePerms(r, roleOverrides) })
    setBusca(''); setGruposAbertos(new Set(PERM_GRUPOS.map(g => g.label)))
    setOpenForm(true)
  }

  function togglePerm(key: PermKey) {
    setForm(prev => {
      const set = new Set(prev.permissoes)
      set.has(key) ? set.delete(key) : set.add(key)
      return { ...prev, permissoes: Array.from(set) }
    })
  }

  function toggleGrupo(keys: readonly string[], allChecked: boolean) {
    setForm(prev => {
      const set = new Set(prev.permissoes)
      for (const k of keys) allChecked ? set.delete(k) : set.add(k)
      return { ...prev, permissoes: Array.from(set) }
    })
  }

  function aplicarPerfil(r: Role) {
    const perms = Object.entries(PERMISSIONS)
      .filter(([, roles]) => (roles as readonly string[]).includes(r))
      .map(([key]) => key)
    setForm(prev => ({ ...prev, permissoes: perms }))
  }

  function toggleGrupoAberto(label: string) {
    setGruposAbertos(prev => {
      const n = new Set(prev)
      n.has(label) ? n.delete(label) : n.add(label)
      return n
    })
  }

  // Grupos filtrados pela busca
  const gruposFiltrados = useMemo(() => {
    if (!busca.trim()) return PERM_GRUPOS
    const q = busca.toLowerCase()
    return PERM_GRUPOS
      .map(g => ({ ...g, items: g.items.filter(i => i.label.toLowerCase().includes(q) || i.key.toLowerCase().includes(q)) }))
      .filter(g => g.items.length > 0)
  }, [busca])

  async function handleSave() {
    setSaving(true)
    if (editingRole) {
      const { data: existing } = await supabase
        .from('perfis_permissoes').select('id')
        .eq('is_role_override', true).eq('role_override', editingRole).maybeSingle()

      const payload = {
        nome: ROLE_LABELS[editingRole], permissoes: form.permissoes,
        empresa_id: usuario?.empresa_id ?? null,
        is_role_override: true, role_override: editingRole,
        atualizado_em: new Date().toISOString(),
      }
      const { error } = existing
        ? await supabase.from('perfis_permissoes').update(payload).eq('id', existing.id)
        : await supabase.from('perfis_permissoes').insert(payload)

      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message })
      } else {
        toast({ title: `Permissões do cargo ${ROLE_LABELS[editingRole]} atualizadas!` })
        setOpenForm(false); setEditingRole(null)
        window.dispatchEvent(new Event('permissions-changed'))
        await Promise.all([load(), refreshPermissions()])
      }
    } else if (selected) {
      const { error } = await supabase.from('perfis_permissoes')
        .update({ nome: form.nome, descricao: form.descricao || null, permissoes: form.permissoes, atualizado_em: new Date().toISOString() })
        .eq('id', selected.id)
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message })
      } else {
        toast({ title: 'Perfil atualizado!' }); setOpenForm(false)
        window.dispatchEvent(new Event('permissions-changed')); load()
      }
    } else {
      if (!form.nome.trim()) {
        toast({ variant: 'destructive', title: 'Nome do perfil é obrigatório' })
        setSaving(false); return
      }
      const { error } = await supabase.from('perfis_permissoes')
        .insert({ nome: form.nome, descricao: form.descricao || null, permissoes: form.permissoes, empresa_id: usuario?.empresa_id ?? null })
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao criar', description: error.message })
      } else {
        toast({ title: 'Perfil criado!' }); setOpenForm(false)
        window.dispatchEvent(new Event('permissions-changed')); load()
      }
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    const { error } = await supabase.from('perfis_permissoes').delete().eq('id', selected.id)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: error.message })
    } else {
      toast({ title: 'Perfil excluído!' }); setOpenDelete(false); load()
    }
    setDeleting(false)
  }

  async function handleResetRole() {
    if (!resettingRole) return
    setDeleting(true)
    await supabase.from('perfis_permissoes').delete()
      .eq('is_role_override', true).eq('role_override', resettingRole)
    toast({ title: `Cargo ${ROLE_LABELS[resettingRole]} restaurado ao padrão!` })
    setOpenReset(false); setResettingRole(null); setDeleting(false)
    window.dispatchEvent(new Event('permissions-changed'))
    await Promise.all([load(), refreshPermissions()])
  }

  // ── Render de mapa de permissões (usado tanto nos cargos quanto nos perfis) ──
  function PermMap({ permissoes, fallbackRole }: { permissoes: string[] | null; fallbackRole?: Role }) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 divide-x divide-y divide-gray-50">
        {PERM_GRUPOS.map(grupo => {
          const keys = grupo.items.map(i => i.key)
          const total = keys.length
          const liberadas = keys.filter(k =>
            permissoes != null
              ? permissoes.includes(k)
              : fallbackRole
                ? (PERMISSIONS[k as keyof typeof PERMISSIONS] as readonly string[])?.includes(fallbackRole)
                : false
          ).length
          const nenhuma = liberadas === 0
          const todas   = liberadas === total
          const Icon    = grupo.icon

          return (
            <div key={grupo.label} className="px-3 py-2.5">
              <div className="flex items-center justify-between mb-2 gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className={cn('w-5 h-5 rounded flex items-center justify-center flex-shrink-0', grupo.color)}>
                    <Icon className="w-3 h-3" />
                  </div>
                  <p className="text-[10px] font-semibold text-gray-500 truncate">{grupo.label}</p>
                </div>
                <span className={cn(
                  'text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0',
                  todas   ? 'bg-green-100 text-green-700' :
                  nenhuma ? 'bg-gray-100 text-gray-400'   :
                            'bg-amber-100 text-amber-700'
                )}>{liberadas}/{total}</span>
              </div>
              <div className="space-y-0.5">
                {grupo.items.map(item => {
                  const tem = permissoes != null
                    ? permissoes.includes(item.key)
                    : fallbackRole
                      ? (PERMISSIONS[item.key as keyof typeof PERMISSIONS] as readonly string[])?.includes(fallbackRole)
                      : false
                  return (
                    <div key={item.key} className="flex items-center gap-1">
                      {tem
                        ? <CheckCircle2 className="w-2.5 h-2.5 text-green-500 flex-shrink-0" />
                        : <XCircle      className="w-2.5 h-2.5 text-gray-200  flex-shrink-0" />
                      }
                      <span className={cn('text-[10px] leading-tight', tem ? 'text-gray-600' : 'text-gray-300')}>
                        {item.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const roles: Role[] = ['master', 'admin', 'operador', 'conciliador', 'fechador', 'marketing', 'gerente']

  return (
    <div className="animate-fade-in">
      <Header
        title="Perfis de Acesso"
        description="Crie perfis customizados com permissões específicas e atribua aos usuários"
        actions={
          <Button onClick={openCreate} className="h-9 bg-orange-500 hover:bg-orange-600 text-[13px] gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Novo Perfil
          </Button>
        }
      />

      <div className="p-3 md:p-6 space-y-8">

        {/* ── Cargos fixos ── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-3.5 h-3.5 text-gray-400" />
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Cargos padrão do sistema</p>
            <span className="text-[10px] text-gray-300 ml-1">— clique em Editar para personalizar</span>
          </div>
          <div className="space-y-3">
            {ROLES_SISTEMA.map(({ role, cor }) => {
              const customizado  = !!roleOverrides[role]
              const permsAtivas  = roleOverrides[role] ?? null

              return (
                <div key={role} className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-50">
                    <span className={cn('text-[11px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wide border', cor)}>
                      {ROLE_LABELS[role]}
                    </span>
                    {customizado
                      ? <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">Personalizado</span>
                      : <span className="text-[11px] text-gray-400">Permissões padrão do sistema</span>
                    }
                    <div className="flex gap-1.5 ml-auto">
                      <Button variant="outline" size="sm"
                        className="h-7 text-[11px] gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                        onClick={() => openEditRole(role)}>
                        <Pencil className="w-3 h-3" /> Editar
                      </Button>
                      {customizado && (
                        <Button variant="outline" size="sm"
                          className="h-7 text-[11px] gap-1 text-red-500 border-red-200 hover:bg-red-50"
                          onClick={() => { setResettingRole(role); setOpenReset(true) }}>
                          <RotateCcw className="w-3 h-3" /> Restaurar padrão
                        </Button>
                      )}
                    </div>
                  </div>
                  <PermMap permissoes={permsAtivas} fallbackRole={role} />
                </div>
              )
            })}
          </div>
        </section>

        {/* ── Perfis customizados ── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Perfis customizados</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-[13px]">Carregando perfis...</span>
            </div>
          ) : perfis.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-200">
              <ShieldCheck className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-[13px] text-gray-400">Nenhum perfil criado ainda.</p>
              <p className="text-[12px] text-gray-300 mt-1">Crie perfis customizados para controlar o acesso dos usuários.</p>
              <Button onClick={openCreate} className="mt-4 h-9 bg-orange-500 hover:bg-orange-600 text-[13px] gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Criar primeiro perfil
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {perfis.map(perfil => (
                <div key={perfil.id} className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-50">
                    <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[14px] text-gray-900">{perfil.nome}</p>
                      {perfil.descricao && <p className="text-[11px] text-gray-400 mt-0.5">{perfil.descricao}</p>}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-gray-400 mr-2">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                        {perfil.permissoes.length} permissões
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-indigo-400" />
                        {perfil._qtdUsuarios} usuário(s)
                      </span>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="outline" size="sm"
                        className="h-8 text-[12px] gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
                        onClick={() => openEdit(perfil)}>
                        <Pencil className="w-3 h-3" /> Editar
                      </Button>
                      <Button variant="outline" size="sm"
                        className="h-8 text-[12px] gap-1.5 text-red-500 border-red-200 hover:bg-red-50"
                        onClick={() => { setSelected(perfil); setOpenDelete(true) }}>
                        <Trash2 className="w-3 h-3" /> Excluir
                      </Button>
                    </div>
                  </div>
                  <PermMap permissoes={perfil.permissoes} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Modal criar/editar ── */}
      <Dialog open={openForm} onOpenChange={open => { if (!saving) setOpenForm(open) }}>
        <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
              </div>
              <DialogTitle className="text-[15px]">
                {editingRole
                  ? `Editar Permissões — ${ROLE_LABELS[editingRole]}`
                  : selected ? 'Editar Perfil' : 'Novo Perfil de Acesso'}
              </DialogTitle>
            </div>
          </DialogHeader>

          <div className="flex flex-col gap-4 overflow-y-auto flex-1 px-6 py-4">

            {/* Nome e descrição */}
            {!editingRole && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[12px] font-medium text-gray-600">Nome do perfil *</Label>
                  <Input value={form.nome}
                    onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                    placeholder="Ex: Supervisor, Financeiro, Gerente..." autoFocus />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[12px] font-medium text-gray-600">Descrição</Label>
                  <Input value={form.descricao}
                    onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
                    placeholder="Opcional — detalhe o uso do perfil" />
                </div>
              </div>
            )}

            {/* Barra de ações rápidas */}
            <div className="bg-gray-50 rounded-lg px-3 py-2.5 flex items-center gap-3 flex-wrap">
              <span className="text-[12px] text-gray-500 font-medium whitespace-nowrap">Começar com:</span>
              <div className="flex gap-1.5 flex-wrap">
                {roles.map(r => (
                  <button key={r} onClick={() => aplicarPerfil(r)}
                    className="text-[11px] px-2.5 py-1 rounded-md border border-gray-200 bg-white hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition-colors font-medium text-gray-600">
                    {ROLE_LABELS[r]}
                  </button>
                ))}
                <button
                  onClick={() => setForm(p => ({ ...p, permissoes: ALL_KEYS.slice() }))}
                  className="text-[11px] px-2.5 py-1 rounded-md border border-green-200 bg-green-50 hover:bg-green-100 transition-colors font-medium text-green-700">
                  Todas
                </button>
                <button
                  onClick={() => setForm(p => ({ ...p, permissoes: [] }))}
                  className="text-[11px] px-2.5 py-1 rounded-md border border-gray-200 bg-white hover:border-red-300 hover:text-red-600 hover:bg-red-50 transition-colors text-gray-400">
                  Limpar
                </button>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <span className="text-[11px] text-indigo-600 font-semibold whitespace-nowrap">
                  {form.permissoes.length}/{ALL_KEYS.length} selecionadas
                </span>
              </div>
            </div>

            {/* Busca de permissões */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="Buscar permissão (ex: pagar, extrato, câmera...)"
                className="pl-9 h-9 text-[13px]" />
            </div>

            {/* Grupos de permissões */}
            <div className="space-y-2">
              {gruposFiltrados.map(grupo => {
                const keys        = grupo.items.map(i => i.key)
                const checkedCount = keys.filter(k => form.permissoes.includes(k)).length
                const allChecked  = checkedCount === keys.length
                const someChecked = checkedCount > 0 && !allChecked
                const isOpen      = busca.trim() ? true : gruposAbertos.has(grupo.label)
                const Icon        = grupo.icon

                return (
                  <div key={grupo.label} className="border border-gray-100 rounded-lg overflow-hidden">
                    {/* Cabeçalho do grupo */}
                    <div className="flex items-center gap-0">
                      {/* Checkbox de todo o grupo */}
                      <button
                        onClick={() => toggleGrupo(keys, allChecked)}
                        className={cn(
                          'flex items-center gap-2.5 px-3 py-2.5 flex-1 text-left transition-colors',
                          allChecked ? 'bg-indigo-50 hover:bg-indigo-100' :
                          someChecked ? 'bg-amber-50 hover:bg-amber-100' :
                          'bg-gray-50 hover:bg-gray-100'
                        )}>
                        <div className={cn(
                          'w-4 h-4 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0',
                          allChecked  ? 'bg-indigo-600 border-indigo-600' :
                          someChecked ? 'bg-amber-400 border-amber-400' :
                          'border-gray-300 bg-white'
                        )}>
                          {allChecked  && <div className="w-2 h-2 rounded-sm bg-white" />}
                          {someChecked && <div className="w-2 h-0.5 rounded-sm bg-white" />}
                        </div>
                        <div className={cn('w-5 h-5 rounded flex items-center justify-center flex-shrink-0', grupo.color)}>
                          <Icon className="w-3 h-3" />
                        </div>
                        <span className="text-[12px] font-semibold text-gray-700">{grupo.label}</span>
                        <span className={cn(
                          'text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1',
                          allChecked  ? 'bg-indigo-200 text-indigo-700' :
                          someChecked ? 'bg-amber-200 text-amber-700' :
                          'bg-gray-200 text-gray-500'
                        )}>
                          {checkedCount}/{keys.length}
                        </span>
                      </button>
                      {/* Toggle expandir/colapsar */}
                      {!busca.trim() && (
                        <button
                          onClick={() => toggleGrupoAberto(grupo.label)}
                          className={cn(
                            'px-3 py-2.5 border-l border-gray-100 transition-colors text-gray-400 hover:text-gray-600',
                            allChecked ? 'bg-indigo-50 hover:bg-indigo-100' :
                            someChecked ? 'bg-amber-50 hover:bg-amber-100' :
                            'bg-gray-50 hover:bg-gray-100'
                          )}>
                          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      )}
                    </div>

                    {/* Itens de permissão */}
                    {isOpen && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 divide-y divide-gray-50 border-t border-gray-100">
                        {grupo.items.map(item => {
                          const checked = form.permissoes.includes(item.key)
                          return (
                            <label key={item.key}
                              className={cn(
                                'flex items-center gap-2.5 px-4 py-2.5 cursor-pointer transition-colors',
                                checked ? 'bg-indigo-50/60 hover:bg-indigo-50' : 'hover:bg-gray-50'
                              )}>
                              <input type="checkbox" checked={checked}
                                onChange={() => togglePerm(item.key)}
                                className="w-3.5 h-3.5 rounded accent-indigo-600 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <span className={cn('text-[12px] leading-tight',
                                  checked ? 'text-indigo-800 font-medium' : 'text-gray-600')}>
                                  {item.label}
                                </span>
                                <p className="text-[10px] text-gray-300 font-mono truncate">{item.key}</p>
                              </div>
                              {checked
                                ? <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                                : <XCircle className="w-3.5 h-3.5 text-gray-200 flex-shrink-0" />}
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}

              {gruposFiltrados.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-[13px]">Nenhuma permissão encontrada para "{busca}"</p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-gray-100">
            <Button variant="outline" onClick={() => setOpenForm(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 min-w-[110px]">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingRole ? 'Salvar permissões' : selected ? 'Salvar' : 'Criar Perfil'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={openDelete}
        onOpenChange={open => { if (!deleting) setOpenDelete(open) }}
        title="Excluir perfil"
        description={`Tem certeza que deseja excluir o perfil "${selected?.nome}"? Os usuários com este perfil voltarão a usar as permissões do seu cargo padrão.`}
        onConfirm={handleDelete}
        loading={deleting}
      />
      <ConfirmDialog
        open={openReset}
        onOpenChange={open => { if (!deleting) setOpenReset(open) }}
        title={`Restaurar padrão — ${resettingRole ? ROLE_LABELS[resettingRole] : ''}`}
        description={`As permissões do cargo ${resettingRole ? ROLE_LABELS[resettingRole] : ''} voltarão às definições originais do sistema. Todos os usuários deste cargo serão afetados.`}
        onConfirm={handleResetRole}
        loading={deleting}
      />
    </div>
  )
}
