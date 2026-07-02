'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import {
  LayoutDashboard, Users, Tag, Target, ClipboardList, Calculator, FileText, ListChecks,
} from 'lucide-react'

interface AbaDef {
  href:   string
  label:  string
  icon:   React.ComponentType<{ className?: string }>
  // Indica se o pathname atual corresponde à aba. Aceita "ativo se startsWith"
  // para que /comissionamento/esquemas/[id] continue marcando "Esquemas".
  match:  (pathname: string) => boolean
}

const ABAS: AbaDef[] = [
  {
    href: '/comissionamento', label: 'Dashboard', icon: LayoutDashboard,
    // O dashboard tem que ser exato — caso contrário casaria com TODAS as abas
    match: p => p === '/comissionamento',
  },
  { href: '/comissionamento/membros',    label: 'Membros',    icon: Users,         match: p => p.startsWith('/comissionamento/membros') },
  { href: '/comissionamento/categorias', label: 'Categorias', icon: Tag,           match: p => p.startsWith('/comissionamento/categorias') },
  { href: '/comissionamento/metas',      label: 'Metas',      icon: Target,        match: p => p.startsWith('/comissionamento/metas') },
  { href: '/comissionamento/checklists', label: 'Checklists', icon: ListChecks,    match: p => p.startsWith('/comissionamento/checklists') },
  { href: '/comissionamento/esquemas',   label: 'Esquemas',   icon: ClipboardList, match: p => p.startsWith('/comissionamento/esquemas') },
  { href: '/comissionamento/simulacao',  label: 'Simulação',  icon: Calculator,    match: p => p.startsWith('/comissionamento/simulacao') },
  { href: '/comissionamento/relatorios', label: 'Relatórios', icon: FileText,      match: p => p.startsWith('/comissionamento/relatorios') },
]

// Rotas onde a barra de abas NÃO deve aparecer (views de impressão, modais
// full-screen, etc.) — esconder mantém a UX dessas telas intacta.
const ROTAS_SEM_ABAS = ['/comissionamento/relatorios/imprimir', '/comissionamento/relatorios/aprovacao']

export function ComissionamentoTabs() {
  const pathname = usePathname()

  if (ROTAS_SEM_ABAS.some(r => pathname.startsWith(r))) return null

  return (
    <nav className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-gray-200 print:hidden">
      <div className="px-4 sm:px-6 flex items-center gap-1 overflow-x-auto">
        {ABAS.map(aba => {
          const Icon   = aba.icon
          const active = aba.match(pathname)
          return (
            <Link
              key={aba.href}
              href={aba.href}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 h-10 text-[12.5px] font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap',
                active
                  ? 'border-amber-600 text-amber-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {aba.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
