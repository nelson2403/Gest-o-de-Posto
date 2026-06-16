'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  LayoutDashboard,
  LogOut,
  Lock,
  ArrowLeftRight, Eye, EyeOff, X, ChevronDown,
  Menu,
  Sun, Moon, Home,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useAuthContext } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { ROLE_LABELS, ROLE_COLORS, getRoleLabel, getRoleColor } from '@/lib/utils/permissions'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/hooks/use-toast'
import type { Role } from '@/types/database.types'
import { NAV_GROUPS, ROLES_SEM_SUBBAR, type NavGroup } from '@/lib/nav'

// ─── Topbar ───────────────────────────────────────────────────────────────────

export function Topbar() {
  const pathname = usePathname()
  const { usuario, signOut, canUser } = useAuthContext()
  const { theme, toggleTheme } = useTheme()
  const role = usuario?.role as Role | undefined
  // Perfis de baixo acesso navegam só pela home de cards — sem a subbar
  const semSubbar = !!role && ROLES_SEM_SUBBAR.includes(role)

  const [openGroup,    setOpenGroup]    = useState<string | null>(null)
  const [openFlyout,   setOpenFlyout]   = useState<string | null>(null)
  const [mobileOpen,   setMobileOpen]   = useState(false)
  const [mobileGroups, setMobileGroups] = useState<Set<string>>(new Set())
  const [userOpen,     setUserOpen]     = useState(false)
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

  // Auto-expande o grupo ativo ao abrir o drawer mobile
  useEffect(() => {
    if (!mobileOpen) return
    const activeGroup = NAV_GROUPS.find(g => groupHasActive(g))
    if (activeGroup) setMobileGroups(new Set([activeGroup.label]))
    else setMobileGroups(new Set())
  }, [mobileOpen])

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
    <header className="sticky top-0 z-40 w-full bg-[#8b1a14] border-b border-black/10 flex-shrink-0 print:hidden">
      <div className="flex items-center h-[52px] px-3 md:px-4 gap-2">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-1 flex-shrink-0">
          <img src="/logo.png" alt="Pedra do Pombal" className="h-10 w-auto flex-shrink-0" />
          <span className="hidden md:block text-[14px] font-extrabold text-white tracking-tight whitespace-nowrap">
            Pedra do Pombal
          </span>
        </Link>

        {/* Divider entre a marca e o menu */}
        <div className="hidden md:block w-px h-6 bg-white/20 mx-3 flex-shrink-0" aria-hidden />

        {/* Botão Início (volta para os cards) — perfis sem subbar */}
        {semSubbar && (
          <Link href="/"
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors flex-shrink-0',
              pathname === '/'
                ? 'bg-white/[0.18] text-white'
                : 'text-white/80 hover:text-white hover:bg-white/[0.10]'
            )}>
            <Home className="w-4 h-4" />
            <span>Início</span>
          </Link>
        )}

        {/* Dashboard link — apenas para quem tem permissão */}
        {canUser('dashboard.view') && (
          <Link href="/"
            className={cn('hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors flex-shrink-0',
              pathname === '/'
                ? 'bg-white/[0.18] text-white'
                : 'text-white/70 hover:text-white hover:bg-white/[0.10]'
            )}>
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </Link>
        )}

        {/* Nav groups — desktop (oculto para perfis de baixo acesso) */}
        <nav ref={navRef} className="hidden md:flex items-center gap-0 flex-1 min-w-0">
          {!semSubbar && NAV_GROUPS.map(group => {
            if (group.onlyForRoles && (!role || !group.onlyForRoles.includes(role))) return null
            const visibleItems = group.items.filter(i => {
              const permOk = !i.permission || canUser(i.permission)
              const roleOk = !i.hideForRoles || !role || !i.hideForRoles.includes(role)
              if (!permOk || !roleOk) return false
              if (i.children && !i.permission) {
                return i.children.some(c =>
                  (!c.permission || canUser(c.permission)) &&
                  (!c.hideForRoles || !role || !c.hideForRoles.includes(role))
                )
              }
              return true
            })
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
                      ? 'text-white border-white bg-white/[0.12]'
                      : isGroupActive
                        ? 'text-white border-white/60'
                        : 'text-white/70 hover:text-white hover:bg-white/[0.10] border-transparent'
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
                      ? 'text-white border-white bg-white/[0.12]'
                      : isGroupActive
                        ? 'text-white border-white/60 bg-transparent'
                        : 'text-white/70 hover:text-white hover:bg-white/[0.10] border-transparent'
                  )}
                >
                  {group.label}
                  <ChevronDown className={cn('w-3 h-3 opacity-50 transition-transform', isOpen && 'rotate-180')} />
                </button>

                {/* Dropdown */}
                {isOpen && (
                  <div
                    className="absolute left-0 top-full mt-0 min-w-[230px] bg-white border border-gray-200 rounded-b-xl shadow-2xl z-50 py-1"
                    onMouseLeave={() => setOpenFlyout(null)}
                  >
                    {visibleItems.map((item, idx) => {
                      const Icon = item.icon
                      const prevItem = visibleItems[idx - 1]
                      const showDivider = idx > 0 && (item.divider || prevItem?.children !== undefined)

                      // Item com flyout (sub-filhos)
                      if (item.children) {
                        const visibleChildren = item.children.filter(c => (!c.permission || canUser(c.permission)) && (!c.hideForRoles || !role || !c.hideForRoles.includes(role)))
                        if (!visibleChildren.length) return null
                        const anyChildActive = visibleChildren.some(c => isActive(c.href))
                        const flyoutOpen = openFlyout === item.label
                        return (
                          <div key={item.label} className="relative"
                            onMouseEnter={() => setOpenFlyout(item.label)}
                          >
                            {showDivider && <div className="my-1 border-t border-gray-200" />}
                            <div className={cn(
                              'flex items-center gap-2.5 px-4 py-2 text-[12.5px] font-medium cursor-default select-none transition-colors',
                              flyoutOpen
                                ? 'text-[#8b1a14] bg-[#8b1a14]/10'
                                : anyChildActive
                                  ? 'text-[#8b1a14] hover:bg-[#8b1a14]/10'
                                  : 'text-gray-700 hover:text-[#8b1a14] hover:bg-[#8b1a14]/10'
                            )}>
                              <Icon className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
                              <span className="flex-1">{item.label}</span>
                              <ChevronDown className="w-3 h-3 -rotate-90 opacity-50 flex-shrink-0" />
                            </div>

                            {/* Flyout panel */}
                            {flyoutOpen && (
                              <div className="absolute left-full top-0 min-w-[220px] bg-white border border-gray-200 rounded-xl shadow-2xl z-50 py-1 ml-px">
                                {visibleChildren.map(child => {
                                  const ChildIcon = child.icon
                                  const active = isActive(child.href)
                                  return (
                                    <Link key={child.href} href={child.href}
                                      className={cn('flex items-center gap-2.5 px-4 py-2 text-[12.5px] font-medium transition-colors',
                                        active
                                          ? 'bg-[#8b1a14] text-white'
                                          : 'text-gray-700 hover:text-[#8b1a14] hover:bg-[#8b1a14]/10'
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

                      const active = item.href ? isActive(item.href) : false
                      return (
                        <div key={item.href}>
                          {showDivider && <div className="my-1 border-t border-gray-200" />}
                          <Link href={item.href!}
                            className={cn('flex items-center gap-2.5 px-4 py-2 text-[12.5px] font-medium transition-colors',
                              active
                                ? 'bg-[#8b1a14] text-white'
                                : 'text-gray-700 hover:text-[#8b1a14] hover:bg-[#8b1a14]/10'
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
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white hover:bg-white/[0.10] transition-colors">
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>


          {/* User avatar dropdown */}
          <div ref={userRef} className="relative ml-1">
            <button onClick={() => setUserOpen(v => !v)}
              className="flex items-center gap-2 pl-2 ml-1 border-l border-white/[0.1] hover:opacity-80 transition-opacity">
              <div className="w-7 h-7 rounded-full bg-white/[0.18] border border-white/30 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                {initials}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-[12px] font-semibold text-white leading-tight truncate max-w-[120px]">{usuario?.nome}</p>
                {role && <span className={cn('text-[9px] font-bold px-1 py-0.5 rounded uppercase tracking-wide', getRoleColor(role))}>{getRoleLabel(role).split(' ')[0]}</span>}
              </div>
              <ChevronDown className={cn('hidden md:block w-3 h-3 text-white/40 transition-transform', userOpen && 'rotate-180')} />
            </button>

            {userOpen && (
              <div className="absolute right-0 top-[calc(100%+8px)] w-[200px] bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden z-50 py-1">
                <div className="px-4 py-3 border-b border-gray-200">
                  <p className="text-[12px] font-semibold text-gray-900 truncate">{usuario?.nome}</p>
                  <p className="text-[11px] text-gray-500 truncate">{usuario?.email}</p>
                </div>
                <button onClick={() => { setUserOpen(false); setShowSenha(true) }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-[12.5px] text-gray-700 hover:bg-[#8b1a14]/10 hover:text-[#8b1a14] transition-colors">
                  <Lock className="w-4 h-4" /> Trocar Senha
                </button>
                <button onClick={() => { setUserOpen(false); abrirConta() }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-[12.5px] text-gray-700 hover:bg-[#8b1a14]/10 hover:text-[#8b1a14] transition-colors">
                  <ArrowLeftRight className="w-4 h-4" /> Trocar Conta
                </button>
                <button onClick={() => { setUserOpen(false); signOut() }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-[12.5px] text-red-600 hover:bg-red-500/10 hover:text-red-700 transition-colors">
                  <LogOut className="w-4 h-4" /> Sair
                </button>
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button onClick={() => setMobileOpen(v => !v)}
            className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/[0.08] transition-colors ml-1">
            {mobileOpen ? <X className="w-4.5 h-4.5" /> : <Menu className="w-4.5 h-4.5" />}
          </button>
        </div>
      </div>

      {/* Dropdown menus — positioned below each group button */}

    </header>

      {/* Mobile side drawer — overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 flex justify-end"
          onClick={() => setMobileOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" />

          {/* Drawer panel */}
          <div
            className="relative w-[80vw] max-w-[300px] h-full bg-[#140503] flex flex-col overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] flex-shrink-0">
              <div className="flex items-center gap-2">
                <img src="/logo.png" alt="" className="h-7 w-auto" />
                <span className="text-[13px] font-bold text-white">Menu</span>
              </div>
              <button onClick={() => setMobileOpen(false)} className="w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.08]">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              {canUser('dashboard.view') && (
                <Link href="/" onClick={() => setMobileOpen(false)}
                  className={cn('flex items-center gap-2.5 px-4 py-3 text-[13px] font-medium border-b border-white/[0.04]',
                    pathname === '/' ? 'text-[#ffaa99]' : 'text-white/60')}>
                  <LayoutDashboard className="w-4 h-4" /> Dashboard
                </Link>
              )}
              {semSubbar && (
                <Link href="/" onClick={() => setMobileOpen(false)}
                  className={cn('flex items-center gap-2.5 px-4 py-3 text-[13px] font-medium border-b border-white/[0.04]',
                    pathname === '/' ? 'text-[#ffaa99]' : 'text-white/60')}>
                  <LayoutDashboard className="w-4 h-4" /> Início
                </Link>
              )}
              {!semSubbar && NAV_GROUPS.map(group => {
                if (group.onlyForRoles && (!role || !group.onlyForRoles.includes(role))) return null
                const visibleItems = group.items.filter(i =>
                  (!i.permission || canUser(i.permission)) &&
                  (!i.hideForRoles || !role || !i.hideForRoles.includes(role))
                )
                if (!visibleItems.length) return null
                const isExpanded = mobileGroups.has(group.label)
                const hasActive  = groupHasActive(group)
                return (
                  <div key={group.label}>
                    <button
                      onClick={() => setMobileGroups(prev => {
                        const next = new Set(prev)
                        if (next.has(group.label)) next.delete(group.label)
                        else next.add(group.label)
                        return next
                      })}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-white/[0.02] hover:bg-white/[0.05] transition-colors border-b border-white/[0.03]"
                    >
                      <span className={cn('text-[9.5px] font-bold uppercase tracking-widest', hasActive ? 'text-[#ffaa99]/70' : 'text-white/30')}>
                        {group.label}
                      </span>
                      <ChevronDown className={cn('w-3 h-3 text-white/30 transition-transform duration-200', isExpanded && 'rotate-180')} />
                    </button>
                    {isExpanded && visibleItems.map(item => {
                      const Icon = item.icon
                      if (item.children) {
                        const visibleChildren = item.children.filter(c =>
                          (!c.permission || canUser(c.permission)) &&
                          (!c.hideForRoles || !role || !c.hideForRoles.includes(role))
                        )
                        if (!visibleChildren.length) return null
                        return (
                          <div key={item.label}>
                            <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-white/30 uppercase tracking-wider flex items-center gap-2">
                              <Icon className="w-3 h-3" />{item.label}
                            </p>
                            {visibleChildren.map(child => {
                              const ChildIcon = child.icon
                              const childActive = isActive(child.href)
                              return (
                                <Link key={child.href} href={child.href}
                                  onClick={() => setMobileOpen(false)}
                                  className={cn('flex items-center gap-2.5 pl-8 pr-4 py-2.5 text-[13px] font-medium border-b border-white/[0.03] transition-colors',
                                    childActive ? 'text-[#ffaa99] bg-[#8b1a14]/20' : 'text-white/60 hover:text-white hover:bg-white/[0.05]')}>
                                  <ChildIcon className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
                                  {child.label}
                                </Link>
                              )
                            })}
                          </div>
                        )
                      }
                      const active = item.href ? isActive(item.href) : false
                      return (
                        <Link key={item.href} href={item.href!}
                          onClick={() => setMobileOpen(false)}
                          className={cn('flex items-center gap-2.5 px-4 py-3 text-[13px] font-medium border-b border-white/[0.03] transition-colors',
                            active ? 'text-[#ffaa99] bg-[#8b1a14]/20' : 'text-white/60 hover:text-white hover:bg-white/[0.05]')}>
                          <Icon className="w-4 h-4 flex-shrink-0 opacity-70" />
                          {item.label}
                        </Link>
                      )
                    })}
                  </div>
                )
              })}
            </div>

            {/* Drawer footer */}
            <div className="border-t border-white/[0.06] py-2 flex-shrink-0">
              <button onClick={() => { setMobileOpen(false); setShowSenha(true) }}
                className="flex items-center gap-2.5 w-full px-4 py-3 text-[13px] text-white/60 hover:text-white hover:bg-white/[0.05] transition-colors">
                <Lock className="w-4 h-4" /> Trocar Senha
              </button>
              <button onClick={() => { setMobileOpen(false); signOut() }}
                className="flex items-center gap-2.5 w-full px-4 py-3 text-[13px] text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-colors">
                <LogOut className="w-4 h-4" /> Sair
              </button>
            </div>
          </div>
        </div>
      )}

    {/* ── Modal Trocar Senha ── */}
    {showSenha && (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
            <div className="w-8 h-8 rounded-lg bg-[#8b1a14]/20 flex items-center justify-center"><Lock className="w-4 h-4 text-[#8b1a14]" /></div>
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
                    className="w-full px-3 py-2 pr-9 text-[13px] rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#8b1a14]/30" required />
                  <button type="button" onClick={() => setShow(!show)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}
            <button type="submit" disabled={savingSenha}
              className="w-full py-2.5 bg-[#8b1a14] text-white text-[13px] font-semibold rounded-lg hover:bg-[#711510] disabled:opacity-50 transition-colors">
              {savingSenha ? 'Salvando...' : 'Alterar Senha'}
            </button>
          </form>
        </div>
      </div>
    )}

    {/* ── Modal Trocar Conta ── */}
    {showConta && (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center"><ArrowLeftRight className="w-4 h-4 text-blue-600" /></div>
            <h2 className="font-semibold text-gray-900 text-[15px]">Trocar Conta</h2>
            <button onClick={() => setShowConta(false)} className="ml-auto text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>

          {/* Lista de contas */}
          <div className="overflow-y-auto max-h-[50vh] p-5 space-y-2">
            {loadingContas
              ? <p className="text-center text-sm text-gray-400 py-4">Carregando...</p>
              : contas.length === 0
                ? <p className="text-center text-sm text-gray-400 py-4">Nenhuma conta vinculada.</p>
                : contas.map(c => (
                  <div key={c.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                        {getInitials(c.nome)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-gray-800 truncate">{c.nome}</p>
                        <p className="text-[11px] text-gray-400 truncate">{c.email}</p>
                      </div>
                      {senhaId !== c.id && (
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => { setSenhaId(c.id); setSenhaVal('') }}
                            className="text-[11px] px-3 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 font-medium">
                            Entrar
                          </button>
                          <button onClick={() => removerConta(c.id)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    {senhaId === c.id && (
                      <div className="mt-3 space-y-2">
                        <div className="relative">
                          <input
                            type={showSenhaVal ? 'text' : 'password'}
                            placeholder="Digite a senha desta conta"
                            value={senhaVal}
                            onChange={e => setSenhaVal(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && trocarPara(c, senhaVal)}
                            className="w-full px-3 py-2 pr-9 text-[13px] rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                          />
                          <button type="button" onClick={() => setShowSenhaVal(!showSenhaVal)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                            {showSenhaVal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => trocarPara(c, senhaVal)} disabled={!!trocando || !senhaVal.trim()}
                            className="flex-1 py-2 text-[13px] font-semibold bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors">
                            {trocando === c.id ? 'Entrando...' : 'Confirmar Entrada'}
                          </button>
                          <button onClick={() => { setSenhaId(null); setSenhaVal('') }}
                            className="px-4 py-2 text-[13px] text-gray-500 rounded-lg hover:bg-gray-100 transition-colors">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
            }
          </div>

          {/* Adicionar conta */}
          <div className="border-t border-gray-100 p-5 space-y-3">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Adicionar conta</p>
            <div className="space-y-2">
              <input
                value={addNome}
                onChange={e => setAddNome(e.target.value)}
                placeholder="Nome (opcional)"
                className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#8b1a14]/30"
              />
              <input
                value={addEmail}
                onChange={e => setAddEmail(e.target.value)}
                placeholder="E-mail da conta"
                type="email"
                className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#8b1a14]/30"
              />
              <button
                onClick={addConta}
                disabled={addSaving || !addEmail.trim()}
                className="w-full py-2 text-[13px] font-semibold bg-[#8b1a14] text-white rounded-lg hover:bg-[#711510] disabled:opacity-50 transition-colors"
              >
                {addSaving ? 'Adicionando...' : 'Adicionar Conta'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
