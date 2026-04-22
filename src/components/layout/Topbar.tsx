'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  LayoutDashboard, Building2, Users, MapPin, CreditCard,
  Smartphone, Percent, Globe, Link2, KeyRound, Monitor,
  Server, LogOut, Fuel, FileText,
  Landmark, Camera, BarChart2, ClipboardList, ShieldCheck,
  Archive, Layers, CheckSquare, ScanSearch, ReceiptText, Lock,
  TrendingUp, Wallet, Receipt, Settings, Megaphone, Gift, Database,
  ArrowLeftRight, Eye, EyeOff, X, ChevronDown,
  PackageSearch, Truck, CalendarDays, ShoppingCart, Menu,
  Bell, Sun, Moon, CheckCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useAuthContext } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/utils/permissions'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/hooks/use-toast'
import type { Role } from '@/types/database.types'
import type { Permission } from '@/lib/utils/permissions'

// ─── Nav types ────────────────────────────────────────────────────────────────

type NavChild = { href: string; label: string; icon: React.ElementType; permission: Permission | null }
type NavItem  = { href?: string; label: string; icon: React.ElementType; permission: Permission | null; children?: NavChild[] }
type NavGroup = { label: string; items: NavItem[] }

// ─── Nav structure ────────────────────────────────────────────────────────────

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Cadastros',
    items: [
      { href: '/empresas',                   label: 'Empresas',           icon: Building2,   permission: 'empresas.view' as Permission },
      { href: '/postos',                      label: 'Postos',              icon: MapPin,      permission: 'postos.view' as Permission },
      { href: '/usuarios',                    label: 'Usuários',            icon: Users,       permission: 'usuarios.view' as Permission },
      { href: '/perfis',                      label: 'Perfis de Acesso',    icon: ShieldCheck, permission: 'usuarios.edit' as Permission },
      { href: '/formas-pagamento-adquirente', label: 'Formas de Pagamento', icon: Wallet,      permission: 'formas_pagamento.view' as Permission },
      { href: '/maquininhas',                 label: 'Maquininhas',         icon: Smartphone,  permission: 'maquininhas.view' as Permission },
      { href: '/taxas',                       label: 'Taxas',               icon: Percent,     permission: 'taxas.view' as Permission },
      { href: '/adquirentes',                 label: 'Adquirentes',         icon: CreditCard,  permission: 'adquirentes.view' as Permission },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { href: '/contas-receber', label: 'Contas a Receber', icon: ReceiptText, permission: 'contas_receber.view' as Permission },
      {
        label: 'Contas a Pagar', icon: Receipt, permission: 'contas_pagar.view' as Permission,
        children: [
          { href: '/contas-pagar/conferencia', label: 'Conferência Diária',    icon: ClipboardList, permission: 'contas_pagar.lancar' as Permission },
          { href: '/contas-pagar/fixas',       label: 'Despesas Fixas',         icon: Wallet,        permission: 'contas_pagar.fixas.view' as Permission },
          { href: '/contas-pagar/titulos',     label: 'Títulos a Pagar',        icon: Database,      permission: 'contas_pagar.view' as Permission },
        ],
      },
      {
        label: 'Conciliação Bancária', icon: ScanSearch, permission: 'relatorios.conciliacao' as Permission,
        children: [
          { href: '/tarefas',                  label: 'Gestão de Tarefas',  icon: CheckSquare,   permission: 'tarefas.view' as Permission },
          { href: '/relatorios/demonstrativo', label: 'Demonstrativo',      icon: FileText,      permission: 'contas_bancarias.view' as Permission },
          { href: '/extrato-painel',           label: 'Extrato Bancário',   icon: ScanSearch,    permission: 'extrato_painel.view' as Permission },
          { href: '/tarefas/conciliacao',      label: 'Geração de Tarefas', icon: ClipboardList, permission: 'contas_bancarias.view' as Permission },
        ],
      },
      { href: '/contas-bancarias', label: 'Contas Bancárias',   icon: Landmark,    permission: 'contas_bancarias.view' as Permission },
      { href: '/controle-caixas',  label: 'Controle de Caixas', icon: CheckSquare, permission: 'controle_caixas.view' as Permission },
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
    label: 'Operações',
    items: [
      {
        label: 'Maquininhas (Bobinas)', icon: Layers, permission: 'bobinas.view' as Permission,
        children: [
          { href: '/bobinas/solicitacoes', label: 'Solicitações', icon: Receipt,  permission: 'bobinas.view' as Permission },
          { href: '/bobinas/trocas',       label: 'Trocas',       icon: Archive,  permission: 'bobinas.view' as Permission },
          { href: '/bobinas/estoque',      label: 'Estoque',      icon: Archive,  permission: 'bobinas.view' as Permission },
        ],
      },
      { href: '/tarefas/avulsas', label: 'Tarefas Avulsas',         icon: ClipboardList, permission: 'tarefas.view' as Permission },
      { href: '/transpombal',     label: 'Transpombal — Frota',    icon: Truck,         permission: 'transpombal.view' as Permission },
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
    label: 'Config.',
    items: [
      { href: '/controle-caixas/configuracoes', label: 'Config. de Caixas',        icon: Settings,    permission: 'controle_caixas.configurar' as Permission },
      { href: '/contas-receber/configuracao',   label: 'Config. Contas a Receber', icon: ReceiptText, permission: 'contas_receber.view' as Permission },
    ],
  },
  {
    label: 'Relatórios',
    items: [
      { href: '/relatorios', label: 'Relatórios', icon: FileText, permission: 'relatorios.view' as Permission },
    ],
  },
  {
    label: 'Analítico',
    items: [
      { href: '/analitico', label: 'Analítico', icon: BarChart2, permission: 'analitico.view' as Permission },
    ],
  },
]

// ─── Notification Bell ────────────────────────────────────────────────────────

interface Notificacao {
  id: string; tipo: string; titulo: string; mensagem: string | null
  lida: boolean; tarefa_id: string | null; posto_nome: string | null; criado_em: string
}

function NotificationBell() {
  const [naoLidas, setNaoLidas] = useState(0)
  const [notifs, setNotifs]     = useState<Notificacao[]>([])
  const [aberto, setAberto]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const carregar = async () => {
    try {
      const res  = await fetch('/api/notificacoes')
      if (!res.ok) return
      const json = await res.json()
      setNotifs(json.notificacoes ?? [])
      setNaoLidas(json.naoLidas ?? 0)
    } catch { /* silencioso */ }
  }

  useEffect(() => {
    carregar()
    const id = setInterval(carregar, 2 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  async function marcarLida(id: string) {
    await fetch('/api/notificacoes/ler', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n))
    setNaoLidas(prev => Math.max(0, prev - 1))
  }

  async function marcarTodas() {
    setLoading(true)
    await fetch('/api/notificacoes/ler', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    setNotifs(prev => prev.map(n => ({ ...n, lida: true })))
    setNaoLidas(0)
    setLoading(false)
  }

  const fmtData = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => { setAberto(v => !v); if (!aberto) carregar() }}
        className="relative w-8 h-8 rounded-lg flex items-center justify-center text-[hsl(220,20%,55%)] hover:text-white hover:bg-white/[0.08] transition-colors">
        <Bell className="w-4 h-4" />
        {naoLidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 top-10 w-[340px] max-h-[480px] flex flex-col bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-100">Notificações</span>
            <div className="flex items-center gap-2">
              {naoLidas > 0 && (
                <button onClick={marcarTodas} disabled={loading} className="text-[11px] text-blue-500 hover:text-blue-700 flex items-center gap-1">
                  <CheckCheck className="w-3.5 h-3.5" /> Marcar todas
                </button>
              )}
              <button onClick={() => setAberto(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {notifs.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-gray-400">Nenhuma notificação</div>
            ) : notifs.map(n => (
              <div key={n.id} className={cn('px-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0',
                !n.lida && n.tipo === 'divergencia_extrato'   && 'bg-red-50/60 dark:bg-red-500/5',
                !n.lida && n.tipo === 'divergencia_resolvida' && 'bg-green-50/60 dark:bg-green-500/5',
              )}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {n.tipo === 'divergencia_extrato'   && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />}
                      {n.tipo === 'divergencia_resolvida' && <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />}
                      <p className={cn('text-[12px] font-semibold leading-tight', n.lida ? 'text-gray-500' : 'text-gray-900 dark:text-gray-100')}>{n.titulo}</p>
                    </div>
                    {n.mensagem && <p className="text-[11px] text-gray-500 leading-snug">{n.mensagem}</p>}
                    <p className="text-[10px] text-gray-400 mt-1">{fmtData(n.criado_em)}</p>
                  </div>
                  {!n.lida && (
                    <button onClick={() => marcarLida(n.id)} className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-200 transition-colors">
                      <span className="w-2 h-2 rounded-full bg-gray-400 block" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Topbar ───────────────────────────────────────────────────────────────────

export function Topbar() {
  const pathname = usePathname()
  const { usuario, signOut, canUser } = useAuthContext()
  const { theme, toggleTheme } = useTheme()
  const role = usuario?.role as Role | undefined

  const [openGroup,   setOpenGroup]   = useState<string | null>(null)
  const [openFlyout,  setOpenFlyout]  = useState<string | null>(null)
  const [mobileOpen,  setMobileOpen]  = useState(false)
  const [userOpen,    setUserOpen]    = useState(false)
  const navRef  = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Fecha dropdowns ao clicar fora
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (navRef.current  && !navRef.current.contains(e.target as Node))  setOpenGroup(null)
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  // Fecha ao navegar
  useEffect(() => { setOpenGroup(null); setOpenFlyout(null); setMobileOpen(false); setUserOpen(false) }, [pathname])

  function isActive(href: string) {
    return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')
  }

  function groupHasActive(group: NavGroup) {
    return group.items.some(item =>
      item.children
        ? item.children.some(c => isActive(c.href))
        : item.href ? isActive(item.href) : false
    )
  }

  const initials = usuario?.nome?.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() ?? 'U'

  // ── Trocar Senha ──
  const [showSenha,   setShowSenha]   = useState(false)
  const [senhaAtual,  setSenhaAtual]  = useState('')
  const [senhaNova,   setSenhaNova]   = useState('')
  const [senhaConf,   setSenhaConf]   = useState('')
  const [showAtual,   setShowAtual]   = useState(false)
  const [showNova,    setShowNova]    = useState(false)
  const [savingSenha, setSavingSenha] = useState(false)

  async function handleTrocarSenha(e: React.FormEvent) {
    e.preventDefault()
    if (senhaNova.length < 6) { toast({ variant: 'destructive', title: 'Mínimo 6 caracteres' }); return }
    if (senhaNova !== senhaConf) { toast({ variant: 'destructive', title: 'Senhas não coincidem' }); return }
    setSavingSenha(true)
    try {
      const sb = createClient()
      const { error: signInError } = await sb.auth.signInWithPassword({ email: usuario?.email ?? '', password: senhaAtual })
      if (signInError) { toast({ variant: 'destructive', title: 'Senha atual incorreta' }); return }
      const { error } = await sb.auth.updateUser({ password: senhaNova })
      if (error) { toast({ variant: 'destructive', title: 'Erro ao atualizar senha' }); return }
      toast({ title: 'Senha alterada com sucesso!' })
      setShowSenha(false); setSenhaAtual(''); setSenhaNova(''); setSenhaConf('')
    } finally { setSavingSenha(false) }
  }

  // ── Trocar Conta ──
  type ContaVinculada = { id: string; nome: string; email: string }
  const [showConta,     setShowConta]     = useState(false)
  const [contas,        setContas]        = useState<ContaVinculada[]>([])
  const [loadingContas, setLoadingContas] = useState(false)
  const [trocando,      setTrocando]      = useState<string | null>(null)
  const [senhaId,       setSenhaId]       = useState<string | null>(null)
  const [senhaVal,      setSenhaVal]      = useState('')
  const [showSenhaVal,  setShowSenhaVal]  = useState(false)
  const [addNome,       setAddNome]       = useState('')
  const [addEmail,      setAddEmail]      = useState('')
  const [addSaving,     setAddSaving]     = useState(false)

  async function abrirConta() {
    setAddNome(''); setAddEmail(''); setSenhaId(null); setSenhaVal('')
    setShowConta(true); setLoadingContas(true)
    const sb = createClient()
    const { data } = await sb.from('usuario_contas_vinculadas').select('id, nome, email').order('criado_em')
    setContas((data ?? []) as ContaVinculada[])
    setLoadingContas(false)
  }

  async function addConta() {
    if (!addEmail.trim()) return
    setAddSaving(true)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setAddSaving(false); return }
    const nome = addNome.trim() || addEmail.split('@')[0]
    const { data, error } = await sb.from('usuario_contas_vinculadas').upsert({ usuario_id: user.id, nome, email: addEmail.trim() }, { onConflict: 'usuario_id,email' }).select('id, nome, email').single()
    if (error) { toast({ variant: 'destructive', title: 'Erro ao adicionar conta' }) }
    else { setContas(prev => [...prev.filter(c => c.email !== addEmail.trim()), data as ContaVinculada]); setAddNome(''); setAddEmail(''); toast({ title: `Conta "${nome}" adicionada!` }) }
    setAddSaving(false)
  }

  async function trocarPara(conta: ContaVinculada, senha: string) {
    setTrocando(conta.id)
    const sb = createClient()
    const { error } = await sb.auth.signInWithPassword({ email: conta.email, password: senha })
    if (error) { toast({ variant: 'destructive', title: 'Senha incorreta' }); setTrocando(null); return }
    setShowConta(false); setSenhaId(null); window.location.href = '/'
  }

  async function removerConta(id: string) {
    const sb = createClient()
    await sb.from('usuario_contas_vinculadas').delete().eq('id', id)
    setContas(prev => prev.filter(c => c.id !== id))
  }

  const getInitials = (nome: string) => nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() || '?'

  return (
    <>
    <header className="sticky top-0 z-40 w-full bg-[hsl(222,44%,8%)] border-b border-white/[0.06] flex-shrink-0">
      <div className="flex items-center h-[52px] px-3 md:px-4 gap-2">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 flex-shrink-0 mr-2">
          <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0">
            <Fuel className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="hidden md:block font-bold text-[13px] text-white leading-tight">Gestão de Postos</span>
        </Link>

        {/* Dashboard link */}
        <Link href="/"
          className={cn('hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors flex-shrink-0',
            pathname === '/'
              ? 'bg-orange-500 text-white'
              : 'text-[hsl(220,20%,60%)] hover:text-white hover:bg-white/[0.08]'
          )}>
          <LayoutDashboard className="w-3.5 h-3.5" />
          <span>Dashboard</span>
        </Link>

        {/* Nav groups — desktop */}
        <nav ref={navRef} className="hidden md:flex items-center gap-0 flex-1 min-w-0">
          {NAV_GROUPS.map(group => {
            const visibleItems = group.items.filter(i => !i.permission || canUser(i.permission))
            if (!visibleItems.length) return null
            const isGroupActive = groupHasActive(group)
            const isOpen = openGroup === group.label

            // Grupo com item único e sem filhos → link direto
            const isSingleDirect = visibleItems.length === 1 && !visibleItems[0].children && visibleItems[0].href
            if (isSingleDirect) {
              const item = visibleItems[0]
              const active = item.href ? isActive(item.href) : false
              return (
                <Link key={group.label} href={item.href!}
                  className={cn('flex items-center gap-1 px-3 py-1.5 h-[52px] text-[12.5px] font-medium transition-colors whitespace-nowrap border-b-2 flex-shrink-0',
                    active
                      ? 'text-white border-orange-500 bg-white/[0.06]'
                      : isGroupActive
                        ? 'text-white border-orange-400/60'
                        : 'text-[hsl(220,20%,60%)] hover:text-white hover:bg-white/[0.05] border-transparent'
                  )}>
                  {group.label}
                </Link>
              )
            }

            return (
              <div key={group.label} ref={el => { groupRefs.current[group.label] = el }} className="relative flex-shrink-0">
                <button
                  onClick={() => setOpenGroup(isOpen ? null : group.label)}
                  className={cn('flex items-center gap-1 px-3 py-1.5 h-[52px] text-[12.5px] font-medium transition-colors whitespace-nowrap border-b-2',
                    isOpen
                      ? 'text-white border-orange-500 bg-white/[0.06]'
                      : isGroupActive
                        ? 'text-white border-orange-400/60 bg-transparent'
                        : 'text-[hsl(220,20%,60%)] hover:text-white hover:bg-white/[0.05] border-transparent'
                  )}
                >
                  {group.label}
                  <ChevronDown className={cn('w-3 h-3 opacity-50 transition-transform', isOpen && 'rotate-180')} />
                </button>

                {/* Dropdown */}
                {isOpen && (
                  <div
                    className="absolute left-0 top-full mt-0 min-w-[230px] bg-[hsl(222,44%,10%)] border border-white/[0.1] rounded-b-xl shadow-2xl z-50 py-1"
                    onMouseLeave={() => setOpenFlyout(null)}
                  >
                    {visibleItems.map((item, idx) => {
                      const Icon = item.icon

                      // Item com flyout (sub-filhos)
                      if (item.children) {
                        const visibleChildren = item.children.filter(c => !c.permission || canUser(c.permission))
                        if (!visibleChildren.length) return null
                        const anyChildActive = visibleChildren.some(c => isActive(c.href))
                        const flyoutOpen = openFlyout === item.label
                        return (
                          <div key={item.label} className="relative"
                            onMouseEnter={() => setOpenFlyout(item.label)}
                          >
                            <div className={cn(
                              'flex items-center gap-2.5 px-4 py-2 text-[12.5px] font-medium cursor-default select-none transition-colors',
                              flyoutOpen
                                ? 'bg-orange-500 text-white'
                                : anyChildActive
                                  ? 'text-orange-300 hover:bg-white/[0.08]'
                                  : 'text-[hsl(220,20%,65%)] hover:text-white hover:bg-white/[0.08]'
                            )}>
                              <Icon className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
                              <span className="flex-1">{item.label}</span>
                              <ChevronDown className="w-3 h-3 -rotate-90 opacity-50 flex-shrink-0" />
                            </div>

                            {/* Flyout panel */}
                            {flyoutOpen && (
                              <div className="absolute left-full top-0 min-w-[220px] bg-[hsl(222,44%,10%)] border border-white/[0.1] rounded-xl shadow-2xl z-50 py-1 ml-px">
                                {visibleChildren.map(child => {
                                  const ChildIcon = child.icon
                                  const active = isActive(child.href)
                                  return (
                                    <Link key={child.href} href={child.href}
                                      className={cn('flex items-center gap-2.5 px-4 py-2 text-[12.5px] font-medium transition-colors',
                                        active
                                          ? 'bg-orange-500 text-white'
                                          : 'text-[hsl(220,20%,65%)] hover:text-white hover:bg-white/[0.08]'
                                      )}>
                                      <ChildIcon className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
                                      {child.label}
                                    </Link>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      }

                      // Separador entre grupos de itens (opcional: linha quando vem após subgrupo)
                      const prevItem = visibleItems[idx - 1]
                      const hasDivider = idx > 0 && prevItem?.children !== undefined

                      const active = item.href ? isActive(item.href) : false
                      return (
                        <div key={item.href}>
                          {hasDivider && <div className="my-1 border-t border-white/[0.06]" />}
                          <Link href={item.href!}
                            className={cn('flex items-center gap-2.5 px-4 py-2 text-[12.5px] font-medium transition-colors',
                              active
                                ? 'bg-orange-500 text-white'
                                : 'text-[hsl(220,20%,65%)] hover:text-white hover:bg-white/[0.08]'
                            )}>
                            <Icon className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
                            {item.label}
                          </Link>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
          {/* Theme toggle */}
          <button onClick={toggleTheme}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[hsl(220,20%,55%)] hover:text-white hover:bg-white/[0.08] transition-colors">
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Notifications */}
          <NotificationBell />

          {/* User avatar dropdown */}
          <div ref={userRef} className="relative ml-1">
            <button onClick={() => setUserOpen(v => !v)}
              className="flex items-center gap-2 pl-2 ml-1 border-l border-white/[0.1] hover:opacity-80 transition-opacity">
              <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                {initials}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-[12px] font-semibold text-white leading-tight truncate max-w-[120px]">{usuario?.nome}</p>
                {role && <span className={cn('text-[9px] font-bold px-1 py-0.5 rounded uppercase tracking-wide', ROLE_COLORS[role])}>{ROLE_LABELS[role].split(' ')[0]}</span>}
              </div>
              <ChevronDown className={cn('hidden md:block w-3 h-3 text-white/40 transition-transform', userOpen && 'rotate-180')} />
            </button>

            {userOpen && (
              <div className="absolute right-0 top-[calc(100%+8px)] w-[200px] bg-[hsl(222,44%,11%)] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden z-50 py-1">
                <div className="px-4 py-3 border-b border-white/[0.06]">
                  <p className="text-[12px] font-semibold text-white truncate">{usuario?.nome}</p>
                  <p className="text-[11px] text-white/30 truncate">{usuario?.email}</p>
                </div>
                <button onClick={() => { setUserOpen(false); setShowSenha(true) }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-[12.5px] text-[hsl(220,20%,60%)] hover:bg-white/[0.06] hover:text-white transition-colors">
                  <Lock className="w-4 h-4" /> Trocar Senha
                </button>
                <button onClick={() => { setUserOpen(false); abrirConta() }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-[12.5px] text-[hsl(220,20%,60%)] hover:bg-white/[0.06] hover:text-white transition-colors">
                  <ArrowLeftRight className="w-4 h-4" /> Trocar Conta
                </button>
                <button onClick={() => { setUserOpen(false); signOut() }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-[12.5px] text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors">
                  <LogOut className="w-4 h-4" /> Sair
                </button>
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button onClick={() => setMobileOpen(v => !v)}
            className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center text-[hsl(220,20%,55%)] hover:text-white hover:bg-white/[0.08] transition-colors ml-1">
            <Menu className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      {/* Dropdown menus — positioned below each group button */}

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/[0.06] bg-[hsl(222,44%,6%)] max-h-[70vh] overflow-y-auto">
          <Link href="/" className={cn('flex items-center gap-2.5 px-4 py-3 text-[13px] font-medium border-b border-white/[0.04]',
            pathname === '/' ? 'text-orange-300' : 'text-[hsl(220,20%,60%)]')}>
            <LayoutDashboard className="w-4 h-4" /> Dashboard
          </Link>
          {NAV_GROUPS.map(group => {
            const visibleItems = group.items.filter(i => !i.permission || canUser(i.permission))
            if (!visibleItems.length) return null
            return (
              <div key={group.label}>
                <p className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white/25 border-b border-white/[0.04]">{group.label}</p>
                {visibleItems.map(item => {
                  const Icon = item.icon
                  const active = item.href ? isActive(item.href) : false
                  return (
                    <Link key={item.href} href={item.href!}
                      className={cn('flex items-center gap-2.5 px-4 py-3 text-[13px] font-medium border-b border-white/[0.03] transition-colors',
                        active ? 'text-orange-300 bg-orange-500/10' : 'text-[hsl(220,20%,60%)] hover:text-white hover:bg-white/[0.05]')}>
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            )
          })}
          <div className="border-t border-white/[0.06] py-2">
            <button onClick={() => { setMobileOpen(false); setShowSenha(true) }}
              className="flex items-center gap-2.5 w-full px-4 py-3 text-[13px] text-[hsl(220,20%,60%)] hover:text-white">
              <Lock className="w-4 h-4" /> Trocar Senha
            </button>
            <button onClick={() => { setMobileOpen(false); signOut() }}
              className="flex items-center gap-2.5 w-full px-4 py-3 text-[13px] text-red-400 hover:text-red-300">
              <LogOut className="w-4 h-4" /> Sair
            </button>
          </div>
        </div>
      )}
    </header>

    {/* ── Modal Trocar Senha ── */}
    {showSenha && (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
            <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center"><Lock className="w-4 h-4 text-orange-600" /></div>
            <div><h2 className="font-semibold text-gray-900 text-[15px]">Trocar Senha</h2><p className="text-[11px] text-gray-400">{usuario?.email}</p></div>
            <button onClick={() => setShowSenha(false)} className="ml-auto text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
          <form onSubmit={handleTrocarSenha} className="p-6 space-y-4">
            {[
              { label: 'Senha atual', val: senhaAtual, set: setSenhaAtual, show: showAtual, setShow: setShowAtual },
              { label: 'Nova senha',  val: senhaNova,  set: setSenhaNova,  show: showNova,  setShow: setShowNova  },
              { label: 'Confirmar nova senha', val: senhaConf, set: setSenhaConf, show: showNova, setShow: setShowNova },
            ].map(({ label, val, set, show, setShow }, i) => (
              <div key={i}>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">{label}</label>
                <div className="relative">
                  <input type={show ? 'text' : 'password'} value={val} onChange={e => set(e.target.value)}
                    className="w-full px-3 py-2 pr-9 text-[13px] rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500/30" required />
                  <button type="button" onClick={() => setShow(!show)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}
            <button type="submit" disabled={savingSenha}
              className="w-full py-2.5 bg-orange-500 text-white text-[13px] font-semibold rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors">
              {savingSenha ? 'Salvando...' : 'Alterar Senha'}
            </button>
          </form>
        </div>
      </div>
    )}

    {/* ── Modal Trocar Conta ── */}
    {showConta && (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center"><ArrowLeftRight className="w-4 h-4 text-blue-600" /></div>
            <h2 className="font-semibold text-gray-900 text-[15px]">Trocar Conta</h2>
            <button onClick={() => setShowConta(false)} className="ml-auto text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
          <div className="p-5 space-y-3">
            {loadingContas ? <p className="text-center text-sm text-gray-400 py-4">Carregando...</p>
              : contas.length === 0 ? <p className="text-center text-sm text-gray-400 py-4">Nenhuma conta vinculada.</p>
              : contas.map(c => (
                <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50">
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">{getInitials(c.nome)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-800 truncate">{c.nome}</p>
                    <p className="text-[11px] text-gray-400 truncate">{c.email}</p>
                    {senhaId === c.id && (
                      <div className="flex items-center gap-2 mt-2">
                        <div className="relative flex-1">
                          <input type={showSenhaVal ? 'text' : 'password'} placeholder="Senha" value={senhaVal} onChange={e => setSenhaVal(e.target.value)}
                            className="w-full px-2 py-1 pr-7 text-[12px] rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                          <button type="button" onClick={() => setShowSenhaVal(!showSenhaVal)} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400">
                            {showSenhaVal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <button onClick={() => trocarPara(c, senhaVal)} disabled={!!trocando}
                          className="px-2 py-1 text-[11px] font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 whitespace-nowrap">
                          {trocando === c.id ? '...' : 'Entrar'}
                        </button>
                      </div>
                    )}
                  </div>
                  {senhaId !== c.id && (
                    <div className="flex gap-1">
                      <button onClick={() => { setSenhaId(c.id); setSenhaVal('') }}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium whitespace-nowrap">Entrar</button>
                      <button onClick={() => removerConta(c.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            <div className="border-t border-gray-100 pt-3">
              <p className="text-[11px] font-medium text-gray-500 mb-2">Adicionar conta</p>
              <div className="flex gap-2">
                <input value={addNome} onChange={e => setAddNome(e.target.value)} placeholder="Nome" className="flex-1 px-2 py-1.5 text-[12px] rounded-lg border border-gray-200 focus:outline-none" />
                <input value={addEmail} onChange={e => setAddEmail(e.target.value)} placeholder="Email" className="flex-1 px-2 py-1.5 text-[12px] rounded-lg border border-gray-200 focus:outline-none" />
                <button onClick={addConta} disabled={addSaving || !addEmail.trim()}
                  className="px-3 py-1.5 text-[12px] font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50">
                  {addSaving ? '...' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
