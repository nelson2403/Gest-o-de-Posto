'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard, Building2, Users, MapPin, CreditCard,
  Smartphone, Percent, Globe, Link2, KeyRound, Monitor,
  Server, LogOut, ChevronLeft, ChevronRight, Fuel, FileText,
  Landmark, Camera, BarChart2, ClipboardList, ShieldCheck,
  Archive, Layers, CheckSquare, ScanSearch, ReceiptText, Lock,
  TrendingUp, Wallet, Receipt, Settings, Megaphone, Gift, Database,
  ArrowLeftRight, Plus, Trash2, Eye, EyeOff, X, Check, ChevronDown,
  PackageSearch, Truck, CalendarDays, ShoppingCart, Scale,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useAuthContext } from '@/contexts/AuthContext'
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/utils/permissions'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/hooks/use-toast'
import type { Role } from '@/types/database.types'
import type { Permission } from '@/lib/utils/permissions'

// ─── Nav types ─────────────────────────────────────────────────────────────────

type NavChild = {
  href: string
  label: string
  icon: React.ElementType
  permission: Permission | null
}

type NavItem = {
  href?: string
  label: string
  icon: React.ElementType
  permission: Permission | null
  children?: NavChild[]
}

type NavGroup = {
  label: string
  items: NavItem[]
}

// ─── Nav structure ─────────────────────────────────────────────────────────────

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Visão Geral',
    items: [
      { href: '/analitico', label: 'Analítico', icon: BarChart2, permission: 'analitico.view' as Permission },
    ],
  },
  {
    label: 'Cadastros',
    items: [
      { href: '/empresas',                    label: 'Empresas',            icon: Building2,   permission: 'empresas.view' as Permission },
      { href: '/postos',                      label: 'Postos',               icon: MapPin,      permission: 'postos.view' as Permission },
      { href: '/usuarios',                    label: 'Usuários',             icon: Users,       permission: 'usuarios.view' as Permission },
      
      { href: '/formas-pagamento-adquirente', label: 'Formas de Pagamento',  icon: Wallet,      permission: 'formas_pagamento.view' as Permission },
      { href: '/maquininhas',                 label: 'Maquininhas',          icon: Smartphone,  permission: 'maquininhas.view' as Permission },
      { href: '/taxas',                       label: 'Taxas',                icon: Percent,     permission: 'taxas.view' as Permission },
      { href: '/adquirentes',                 label: 'Adquirentes',          icon: CreditCard,  permission: 'adquirentes.view' as Permission },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { href: '/contas-receber', label: 'Contas a Receber', icon: ReceiptText, permission: 'contas_receber.view' as Permission },
      {
        label: 'Contas a Pagar', icon: Receipt, permission: 'contas_pagar.view' as Permission,
        children: [
          { href: '/contas-pagar/conferencia', label: 'Conferência Diária',     icon: ClipboardList, permission: 'contas_pagar.lancar' as Permission },
          { href: '/contas-pagar/fixas',       label: 'Despesas Fixas',          icon: Wallet,        permission: 'contas_pagar.fixas.view' as Permission },
          { href: '/contas-pagar/titulos',     label: 'Títulos Contas a Pagar',  icon: Database,      permission: 'contas_pagar.view' as Permission },
        ],
      },
      {
        label: 'Conciliação Bancária', icon: ScanSearch, permission: 'relatorios.conciliacao' as Permission,
        children: [
          { href: '/tarefas',                  label: 'Gestão de Tarefas',   icon: CheckSquare,   permission: 'tarefas.view' as Permission },
          { href: '/relatorios/demonstrativo', label: 'Demonstrativo',       icon: FileText,      permission: 'contas_bancarias.view' as Permission },
          { href: '/extrato-painel',           label: 'Extrato Bancário',    icon: ScanSearch,    permission: 'extrato_painel.view' as Permission },
          { href: '/tarefas/conciliacao',      label: 'Geração de Tarefas',  icon: ClipboardList, permission: 'contas_bancarias.view' as Permission },
        ],
      },
      { href: '/contas-bancarias', label: 'Contas Bancárias',   icon: Landmark,    permission: 'contas_bancarias.view' as Permission },
      { href: '/controle-caixas',  label: 'Controle de Caixas', icon: CheckSquare, permission: 'controle_caixas.view' as Permission },
    ],
  },
  {
    label: 'Acessos',
    items: [
      { href: '/portais',            label: 'Portais',            icon: Globe,    permission: 'portais.view' as Permission },
      { href: '/acessos-unificados', label: 'Acessos Unificados', icon: Link2,    permission: 'acessos.view' as Permission },
      { href: '/acessos-postos',     label: 'Acessos dos Postos', icon: KeyRound, permission: 'acessos.view' as Permission },
      { href: '/acessos-anydesk',    label: 'AnyDesk',            icon: Monitor,  permission: 'anydesk.view' as Permission },
      { href: '/servidores',         label: 'Servidores',         icon: Server,   permission: 'servidores.view' as Permission },
      { href: '/acessos-cameras',    label: 'Câmeras',            icon: Camera,   permission: 'cameras.view' as Permission },
      { href: '/senhas-tef',         label: 'Senhas TEF',         icon: Lock,     permission: 'senhas_tef.view' as Permission },
    ],
  },
  {
    label: 'Estoque',
    items: [
      { href: '/estoque',             label: 'Estoque',            icon: PackageSearch, permission: 'estoque.view' as Permission },
      { href: '/sugestao-pedido',     label: 'Sugestão de Pedido', icon: ShoppingCart,  permission: 'estoque.view' as Permission },
      { href: '/fornecedores',        label: 'Fornecedores',       icon: Truck,         permission: 'estoque.view' as Permission },
      { href: '/rotina-fornecedores', label: 'Rotina de Visitas',  icon: CalendarDays,  permission: 'estoque.view' as Permission },
    ],
  },
  {
    label: 'Operações',
    items: [
      {
        label: 'Maquininhas', icon: Layers, permission: 'bobinas.view' as Permission,
        children: [
          { href: '/bobinas/solicitacoes', label: 'Troca de Maquininhas', icon: Receipt,  permission: 'bobinas.view' as Permission },
          { href: '/bobinas/trocas',       label: 'Trocas',            icon: Archive,  permission: 'bobinas.view' as Permission },
          { href: '/bobinas/estoque',      label: 'Estoque de Bobinas', icon: Archive, permission: 'bobinas.view' as Permission },
        ],
      },
      { href: '/tarefas/avulsas', label: 'Tarefas', icon: ClipboardList, permission: 'tarefas.view' as Permission },
    ],
  },
  {
    label: 'Configurações',
    items: [
      { href: '/perfis',                                 label: 'Perfis de Acesso',         icon: ShieldCheck,   permission: 'usuarios.edit' as Permission },
      { href: '/controle-caixas/configuracoes',          label: 'Config. de Caixas',        icon: Settings,      permission: 'controle_caixas.configurar' as Permission },
      { href: '/contas-receber/configuracao',            label: 'Config. Contas a Receber', icon: ReceiptText,   permission: 'contas_receber.view' as Permission },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { href: '/marketing',             label: 'Dashboard',   icon: Megaphone,  permission: 'marketing.view' as Permission },
      { href: '/marketing/patrocinio',  label: 'Patrocínios', icon: Gift,       permission: 'marketing.create_patrocinio' as Permission },
      { href: '/marketing/acoes',       label: 'Ações',       icon: TrendingUp, permission: 'marketing.ver_acoes' as Permission },
      { href: '/marketing/conciliacao', label: 'Conciliação', icon: Link2,      permission: 'marketing.conciliacao' as Permission },
    ],
  },
  {
    label: 'Fiscal',
    items: [
      { href: '/fiscal',          label: 'Painel Fiscal',      icon: Scale,         permission: 'fiscal.view' as Permission },
      { href: '/fiscal/tarefas',  label: 'Tarefas Fiscal',     icon: ClipboardList, permission: 'fiscal.view' as Permission },
      { href: '/fiscal/geracao',  label: 'Geração de Tarefas', icon: FileText,      permission: 'fiscal.geracao' as Permission },
    ],
  },
  {
    label: 'Relatórios',
    items: [
      { href: '/relatorios', label: 'Relatórios', icon: FileText, permission: 'relatorios.view' as Permission },
    ],
  },
]

// ─── Component ─────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname()
  const { usuario, signOut, canUser } = useAuthContext()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const role = usuario?.role as Role | undefined

  // Listen for hamburger toggle event from Header
  useEffect(() => {
    const handler = () => setMobileOpen(prev => !prev)
    window.addEventListener('toggle-sidebar', handler)
    return () => window.removeEventListener('toggle-sidebar', handler)
  }, [])

  // ── Collapsible groups ──────────────────────────────────────────────────────
  const [openGroups,  setOpenGroups]  = useState<Set<string>>(new Set())
  const [openParents, setOpenParents] = useState<Set<string>>(new Set())

  // Auto-open the group/parent that contains the active route + close mobile on navigate
  useEffect(() => {
    setMobileOpen(false)
    const groups  = new Set<string>()
    const parents = new Set<string>()
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        if (item.children) {
          for (const child of item.children) {
            if (isActive(child.href)) {
              groups.add(group.label)
              parents.add(group.label + '::' + item.label)
            }
          }
        } else if (item.href && isActive(item.href)) {
          groups.add(group.label)
        }
      }
    }
    setOpenGroups(groups)
    setOpenParents(parents)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  function toggleGroup(label: string) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })
  }

  function toggleParent(key: string) {
    setOpenParents(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function isActive(href: string) {
    return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')
  }

  // ── Trocar Senha ────────────────────────────────────────────────────────────
  const [showSenhaModal, setShowSenhaModal] = useState(false)
  const [senhaAtual,     setSenhaAtual]     = useState('')
  const [senhaNova,      setSenhaNova]      = useState('')
  const [senhaConfirm,   setSenhaConfirm]   = useState('')
  const [savingSenha,    setSavingSenha]    = useState(false)

  // ── Trocar Conta ────────────────────────────────────────────────────────────
  type ContaVinculada = { id: string; nome: string; email: string }

  const [showTrocarConta, setShowTrocarConta] = useState(false)
  const [contas,          setContas]          = useState<ContaVinculada[]>([])
  const [loadingContas,   setLoadingContas]   = useState(false)
  const [trocando,        setTrocando]        = useState<string | null>(null)
  const [senhaPromptId,   setSenhaPromptId]   = useState<string | null>(null)
  const [senhaPromptVal,  setSenhaPromptVal]  = useState('')
  const [showSenhaVal,    setShowSenhaVal]    = useState(false)
  const [addNome,    setAddNome]    = useState('')
  const [addEmail,   setAddEmail]   = useState('')
  const [addSaving,  setAddSaving]  = useState(false)

  async function abrirTrocarConta() {
    setAddNome(''); setAddEmail('')
    setSenhaPromptId(null); setSenhaPromptVal('')
    setShowTrocarConta(true)
    setLoadingContas(true)
    const sb = createClient()
    const { data } = await sb
      .from('usuario_contas_vinculadas')
      .select('id, nome, email')
      .order('criado_em')
    setContas((data ?? []) as ContaVinculada[])
    setLoadingContas(false)
  }

  async function handleAdicionarConta() {
    if (!addEmail.trim()) return
    setAddSaving(true)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setAddSaving(false); return }
    const nome = addNome.trim() || addEmail.trim().split('@')[0]
    const { data, error } = await sb
      .from('usuario_contas_vinculadas')
      .upsert({ usuario_id: user.id, nome, email: addEmail.trim() }, { onConflict: 'usuario_id,email' })
      .select('id, nome, email')
      .single()
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao adicionar conta', description: error.message })
    } else {
      setContas(prev => [...prev.filter(c => c.email !== addEmail.trim()), data as ContaVinculada])
      setAddNome(''); setAddEmail('')
      toast({ title: `Conta "${nome}" adicionada!` })
    }
    setAddSaving(false)
  }

  async function handleTrocarPara(conta: ContaVinculada, senha: string) {
    setTrocando(conta.id)
    const sb = createClient()
    const { error } = await sb.auth.signInWithPassword({ email: conta.email, password: senha })
    if (error) {
      toast({ variant: 'destructive', title: 'Senha incorreta', description: 'Verifique e tente novamente.' })
      setTrocando(null)
      return
    }
    setShowTrocarConta(false)
    setSenhaPromptId(null)
    window.location.href = '/'
  }

  async function handleRemoverConta(id: string) {
    const sb = createClient()
    await sb.from('usuario_contas_vinculadas').delete().eq('id', id)
    setContas(prev => prev.filter(c => c.id !== id))
  }

  function getInitials(nome: string) {
    return nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() || '?'
  }

  async function handleTrocarSenha(e: React.FormEvent) {
    e.preventDefault()
    if (senhaNova.length < 6) {
      toast({ variant: 'destructive', title: 'A nova senha deve ter pelo menos 6 caracteres' }); return
    }
    if (senhaNova !== senhaConfirm) {
      toast({ variant: 'destructive', title: 'As senhas não coincidem' }); return
    }
    setSavingSenha(true)
    try {
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: usuario?.email ?? '',
        password: senhaAtual,
      })
      if (signInError) {
        toast({ variant: 'destructive', title: 'Senha atual incorreta' }); return
      }
      const { error } = await supabase.auth.updateUser({ password: senhaNova })
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao atualizar senha', description: error.message }); return
      }
      toast({ title: 'Senha alterada com sucesso!' })
      setShowSenhaModal(false)
      setSenhaAtual(''); setSenhaNova(''); setSenhaConfirm('')
    } finally {
      setSavingSenha(false)
    }
  }

  const initials = usuario?.nome
    ?.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() ?? 'U'

  return (
    <>
    {/* Mobile backdrop */}
    {mobileOpen && (
      <div
        className="fixed inset-0 bg-black/50 z-30 md:hidden"
        onClick={() => setMobileOpen(false)}
      />
    )}
    <aside
      className={cn(
        'flex flex-col h-screen flex-shrink-0 z-40',
        'fixed top-0 left-0 md:sticky',
        'bg-[hsl(222,44%,8%)] text-[hsl(220,20%,80%)]',
        'transition-[width,transform] duration-300 ease-in-out',
        collapsed ? 'w-[64px]' : 'w-[240px]',
        // Mobile: slide in/out; Desktop: always visible
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}
    >
      {/* Logo */}
      <div className={cn(
        'flex items-center gap-3 h-[60px] px-4 border-b border-white/[0.06] flex-shrink-0',
        collapsed && 'justify-center px-0',
      )}>
        <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0">
          <Fuel className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden min-w-0">
            <p className="font-semibold text-[13px] text-white truncate leading-tight">Gestão de Postos</p>
            <p className="text-[11px] opacity-35 truncate">Sistema de Controle</p>
          </div>
        )}
      </div>

      {/* Dashboard — link fixo no topo */}
      <div className="px-2 pt-2 pb-0 flex-shrink-0">
        <Link
          href="/"
          title={collapsed ? 'Dashboard' : undefined}
          className={cn(
            'flex items-center gap-2.5 px-3 py-[9px] rounded-lg text-[13px] font-medium',
            'transition-all duration-150',
            pathname === '/'
              ? 'bg-orange-500 text-white shadow-sm'
              : 'text-[hsl(220,20%,65%)] hover:bg-white/[0.06] hover:text-white',
            collapsed && 'justify-center px-2',
          )}
        >
          <LayoutDashboard className="w-[17px] h-[17px] flex-shrink-0" />
          {!collapsed && <span>Dashboard</span>}
        </Link>
      </div>

      {/* Navegação com grupos colapsáveis */}
      <nav className="flex-1 overflow-y-auto py-1.5 scrollbar-thin space-y-px">
        {NAV_GROUPS.map(group => {
          const visibleItems = group.items.filter(item =>
            !item.permission || canUser(item.permission)
          )
          if (!visibleItems.length) return null

          const isOpen = collapsed || openGroups.has(group.label)
          const anyGroupActive = visibleItems.some(item =>
            item.children
              ? item.children.some(c => isActive(c.href))
              : item.href ? isActive(item.href) : false
          )

          return (
            <div key={group.label}>
              {/* Cabeçalho do grupo — estilo SmartMenus */}
              {!collapsed && (
                <button
                  onClick={() => toggleGroup(group.label)}
                  className={cn(
                    'w-full flex items-center justify-between px-4 py-2.5 select-none transition-all duration-150',
                    isOpen
                      ? 'bg-[hsl(222,50%,18%)] text-white'
                      : anyGroupActive
                        ? 'bg-[hsl(222,50%,14%)] text-orange-300 hover:bg-[hsl(222,50%,16%)]'
                        : 'text-[hsl(220,15%,50%)] hover:bg-[hsl(222,44%,11%)] hover:text-[hsl(220,15%,70%)]',
                  )}
                >
                  <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em]">
                    {group.label}
                  </span>
                  <ChevronDown className={cn(
                    'w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200',
                    isOpen && 'rotate-180',
                  )} />
                </button>
              )}

              {/* Itens do grupo */}
              {isOpen && (
                <div className={cn(
                  !collapsed && 'bg-[hsl(222,44%,6%)]',
                )}>
                  {visibleItems.map(item => {
                    const Icon = item.icon

                    // ── Item com filhos ──
                    if (item.children) {
                      const visibleChildren = item.children.filter(c =>
                        !c.permission || canUser(c.permission)
                      )
                      if (!visibleChildren.length) return null

                      const parentKey = group.label + '::' + item.label
                      const isParentOpen = openParents.has(parentKey)
                      const anyChildActive = visibleChildren.some(c => isActive(c.href))

                      return (
                        <div key={item.label}>
                          <button
                            onClick={() => !collapsed && toggleParent(parentKey)}
                            title={collapsed ? item.label : undefined}
                            className={cn(
                              'flex items-center gap-2.5 w-full px-4 py-2.5 text-[12.5px] font-medium transition-all duration-150',
                              anyChildActive
                                ? 'text-orange-300 bg-[hsl(222,44%,10%)]'
                                : 'text-[hsl(220,15%,55%)] hover:bg-[hsl(222,44%,11%)] hover:text-white',
                              collapsed && 'justify-center px-2',
                            )}
                          >
                            <Icon className="w-[16px] h-[16px] flex-shrink-0" />
                            {!collapsed && (
                              <>
                                <span className="flex-1 text-left truncate">{item.label}</span>
                                <ChevronDown className={cn(
                                  'w-3 h-3 flex-shrink-0 transition-transform duration-200 opacity-50',
                                  isParentOpen && 'rotate-180 opacity-80',
                                )} />
                              </>
                            )}
                          </button>

                          {/* Filhos */}
                          {!collapsed && isParentOpen && (
                            <div className="bg-[hsl(222,44%,4%)]">
                              {visibleChildren.map(child => {
                                const ChildIcon = child.icon
                                const active = isActive(child.href)
                                return (
                                  <Link
                                    key={child.href}
                                    href={child.href}
                                    className={cn(
                                      'flex items-center gap-2 pl-9 pr-4 py-2 text-[12px] font-medium transition-all duration-150 border-l-2',
                                      active
                                        ? 'border-orange-400 bg-[hsl(222,44%,10%)] text-orange-300'
                                        : 'border-transparent text-[hsl(220,15%,45%)] hover:bg-[hsl(222,44%,9%)] hover:text-white hover:border-white/20',
                                    )}
                                  >
                                    <ChildIcon className="w-[13px] h-[13px] flex-shrink-0" />
                                    <span className="truncate">{child.label}</span>
                                  </Link>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    }

                    // ── Item simples ──
                    const active = item.href ? isActive(item.href) : false
                    return (
                      <Link
                        key={item.href}
                        href={item.href!}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          'flex items-center gap-2.5 px-4 py-2.5 text-[12.5px] font-medium transition-all duration-150',
                          active
                            ? 'bg-orange-500 text-white'
                            : 'text-[hsl(220,15%,55%)] hover:bg-[hsl(222,44%,11%)] hover:text-white',
                          collapsed && 'justify-center px-2',
                        )}
                      >
                        <Icon className="w-[16px] h-[16px] flex-shrink-0" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Usuário + ações */}
      <div className="border-t border-white/[0.06] p-2 space-y-0.5 flex-shrink-0">
        {!collapsed && usuario && (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg mb-0.5">
            <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="overflow-hidden flex-1 min-w-0">
              <p className="text-[13px] font-medium text-white truncate leading-tight">{usuario.nome}</p>
              <p className="text-[11px] opacity-35 truncate">{usuario.email}</p>
            </div>
            {role && (
              <span className={cn(
                'text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 uppercase tracking-wide',
                ROLE_COLORS[role],
              )}>
                {ROLE_LABELS[role].split(' ')[0]}
              </span>
            )}
          </div>
        )}
        <button
          onClick={() => setShowSenhaModal(true)}
          title={collapsed ? 'Trocar senha' : undefined}
          className={cn(
            'flex items-center gap-2.5 w-full px-3 py-[9px] rounded-lg text-[13px]',
            'text-[hsl(220,20%,55%)] hover:bg-white/[0.06] hover:text-white transition-all duration-150',
            collapsed && 'justify-center px-2',
          )}
        >
          <Lock className="w-[17px] h-[17px] flex-shrink-0" />
          {!collapsed && <span>Trocar Senha</span>}
        </button>
        <button
          onClick={abrirTrocarConta}
          title={collapsed ? 'Trocar conta' : undefined}
          className={cn(
            'flex items-center gap-2.5 w-full px-3 py-[9px] rounded-lg text-[13px]',
            'text-[hsl(220,20%,55%)] hover:bg-white/[0.06] hover:text-white transition-all duration-150',
            collapsed && 'justify-center px-2',
          )}
        >
          <ArrowLeftRight className="w-[17px] h-[17px] flex-shrink-0" />
          {!collapsed && <span>Trocar Conta</span>}
        </button>
        <button
          onClick={signOut}
          title={collapsed ? 'Sair' : undefined}
          className={cn(
            'flex items-center gap-2.5 w-full px-3 py-[9px] rounded-lg text-[13px]',
            'text-[hsl(220,20%,55%)] hover:bg-red-500/[0.12] hover:text-red-400 transition-all duration-150',
            collapsed && 'justify-center px-2',
          )}
        >
          <LogOut className="w-[17px] h-[17px] flex-shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>

      {/* ── Modal Trocar Senha ── */}
      {showSenhaModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                <Lock className="w-4 h-4 text-orange-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 text-[15px]">Trocar Senha</h2>
                <p className="text-[11px] text-gray-400">{usuario?.email}</p>
              </div>
              <button
                onClick={() => { setShowSenhaModal(false); setSenhaAtual(''); setSenhaNova(''); setSenhaConfirm('') }}
                className="ml-auto text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleTrocarSenha} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-gray-700 mb-1">Senha atual <span className="text-red-500">*</span></label>
                <input type="password" value={senhaAtual} onChange={e => setSenhaAtual(e.target.value)} required
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Digite a senha atual" />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-gray-700 mb-1">Nova senha <span className="text-red-500">*</span></label>
                <input type="password" value={senhaNova} onChange={e => setSenhaNova(e.target.value)} required minLength={6}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Mínimo 6 caracteres" />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-gray-700 mb-1">Confirmar nova senha <span className="text-red-500">*</span></label>
                <input type="password" value={senhaConfirm} onChange={e => setSenhaConfirm(e.target.value)} required
                  className={cn(
                    'w-full px-3 py-2.5 border rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-500',
                    senhaConfirm && senhaNova !== senhaConfirm ? 'border-red-400' : 'border-gray-300',
                  )}
                  placeholder="Repita a nova senha" />
                {senhaConfirm && senhaNova !== senhaConfirm && (
                  <p className="text-[11px] text-red-500 mt-1">As senhas não coincidem</p>
                )}
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button"
                  onClick={() => { setShowSenhaModal(false); setSenhaAtual(''); setSenhaNova(''); setSenhaConfirm('') }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-[13px] font-medium hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={savingSenha}
                  className="flex-1 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white rounded-lg text-[13px] font-medium transition-colors">
                  {savingSenha ? 'Salvando...' : 'Alterar Senha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Trocar Conta ── */}
      {showTrocarConta && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[90vh]">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <ArrowLeftRight className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-gray-900 text-[15px]">Trocar Conta</h2>
                <p className="text-[11px] text-gray-400">Disponível em qualquer dispositivo</p>
              </div>
              <button onClick={() => { setShowTrocarConta(false); setSenhaPromptId(null) }} className="text-gray-400 hover:text-gray-600 ml-auto">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {/* Conta atual */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">Conta atual</p>
                <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5">
                  <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-800 truncate">{usuario?.nome}</p>
                    <p className="text-[11px] text-gray-500 truncate">{usuario?.email}</p>
                  </div>
                  <span className={cn(
                    'text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0',
                    role ? ROLE_COLORS[role] : 'bg-gray-100 text-gray-600'
                  )}>
                    {role ? ROLE_LABELS[role].split(' ')[0] : ''}
                  </span>
                </div>
              </div>

              {/* Contas vinculadas */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">Trocar para</p>
                {loadingContas ? (
                  <div className="flex items-center justify-center py-6 text-gray-400 gap-2">
                    <span className="w-4 h-4 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
                    <span className="text-[12px]">Carregando...</span>
                  </div>
                ) : contas.length === 0 ? (
                  <p className="text-[12px] text-gray-400 text-center py-4">Nenhuma conta vinculada ainda.</p>
                ) : (
                  <div className="space-y-2">
                    {contas.map(c => (
                      <div key={c.id} className={cn(
                        'border rounded-xl overflow-hidden transition-all',
                        senhaPromptId === c.id ? 'border-indigo-300' : 'border-gray-100'
                      )}>
                        <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-[11px] font-bold flex-shrink-0">
                            {getInitials(c.nome)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-gray-800 truncate">{c.nome}</p>
                            <p className="text-[11px] text-gray-400 truncate">{c.email}</p>
                          </div>
                          <button
                            onClick={() => { setSenhaPromptId(senhaPromptId === c.id ? null : c.id); setSenhaPromptVal('') }}
                            disabled={!!trocando}
                            className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors flex-shrink-0"
                          >
                            <ArrowLeftRight className="w-3 h-3" /> Entrar
                          </button>
                          <button
                            onClick={() => handleRemoverConta(c.id)}
                            className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 ml-0.5"
                            title="Remover conta"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {senhaPromptId === c.id && (
                          <div className="px-3 pb-3 pt-1 bg-indigo-50 border-t border-indigo-100 space-y-2">
                            <p className="text-[11px] text-indigo-600 font-medium">Digite a senha de {c.email}</p>
                            <div className="relative">
                              <input
                                type={showSenhaVal ? 'text' : 'password'}
                                value={senhaPromptVal}
                                onChange={e => setSenhaPromptVal(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && senhaPromptVal && handleTrocarPara(c, senhaPromptVal)}
                                placeholder="Senha da conta"
                                autoFocus
                                className="w-full px-3 py-2 pr-9 border border-indigo-200 rounded-lg text-[12px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                              />
                              <button type="button" onClick={() => setShowSenhaVal(p => !p)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                {showSenhaVal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => { setSenhaPromptId(null); setSenhaPromptVal('') }}
                                className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-[12px] text-gray-600 hover:bg-white">
                                Cancelar
                              </button>
                              <button
                                onClick={() => handleTrocarPara(c, senhaPromptVal)}
                                disabled={!senhaPromptVal || trocando === c.id}
                                className="flex-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[12px] font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1">
                                {trocando === c.id
                                  ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                  : <><Check className="w-3 h-3" /> Confirmar</>}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Vincular nova conta */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">Vincular conta</p>
                <div className="border border-dashed border-gray-200 rounded-xl p-3 space-y-2.5">
                  <input
                    type="text"
                    value={addNome}
                    onChange={e => setAddNome(e.target.value)}
                    placeholder="Apelido (ex: Master, Conciliador...)"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <input
                    type="email"
                    value={addEmail}
                    onChange={e => setAddEmail(e.target.value)}
                    placeholder="Email da outra conta *"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <p className="text-[10px] text-gray-400 leading-relaxed">
                    Apenas o e-mail é salvo. A senha será pedida na hora de trocar.
                  </p>
                  <button
                    onClick={handleAdicionarConta}
                    disabled={addSaving || !addEmail.trim()}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-[12px] font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {addSaving
                      ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : <><Plus className="w-3 h-3" /> Vincular conta</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Botão colapsar */}
      <button
        onClick={() => setCollapsed(p => !p)}
        title={collapsed ? 'Expandir menu' : 'Colapsar menu'}
        className={cn(
          'absolute -right-3 top-[72px] w-6 h-6 rounded-full z-10',
          'bg-[hsl(222,44%,11%)] border border-white/10',
          'flex items-center justify-center text-[hsl(220,20%,55%)]',
          'hover:bg-[hsl(222,44%,17%)] hover:text-white transition-all duration-150 shadow-sm',
        )}
      >
        {collapsed
          ? <ChevronRight className="w-3.5 h-3.5" />
          : <ChevronLeft  className="w-3.5 h-3.5" />
        }
      </button>
    </aside>
    </>
  )
}
