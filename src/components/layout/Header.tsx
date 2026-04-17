'use client'

import Link from 'next/link'
import { useAuthContext } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { ROLE_LABELS, ROLE_COLORS, can } from '@/lib/utils/permissions'
import { cn } from '@/lib/utils/cn'
import type { Role } from '@/types/database.types'
import { Layers, CheckSquare, Sun, Moon } from 'lucide-react'

interface HeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
}

export function Header({ title, description, actions }: HeaderProps) {
  const { usuario } = useAuthContext()
  const { theme, toggleTheme } = useTheme()
  const role = usuario?.role as Role | undefined

  const initials = usuario?.nome
    ?.split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase() ?? 'U'

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between h-[60px] px-6 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200/80 dark:border-gray-800 gap-4">
      <div className="min-w-0">
        <h1 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100 leading-tight">{title}</h1>
        {description && <p className="text-[12px] text-gray-400 dark:text-gray-500 leading-tight truncate">{description}</p>}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {actions}

        {/* Atalhos rápidos */}
        <div className="flex items-center gap-1 pr-1">
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 transition-colors"
          >
            {theme === 'dark'
              ? <Sun className="w-4 h-4" />
              : <Moon className="w-4 h-4" />
            }
          </button>
          {can(role ?? null, 'bobinas.view') && (
            <Link href="/bobinas" title="Bobinas"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
              <Layers className="w-4 h-4" />
            </Link>
          )}
          {can(role ?? null, 'controle_caixas.view') && (
            <Link href="/controle-caixas" title="Controle de Caixas"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
              <CheckSquare className="w-4 h-4" />
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2.5 pl-3 ml-1 border-l border-gray-200 dark:border-gray-800">
          <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 shadow-sm">
            {initials}
          </div>
          <div className="hidden md:block">
            <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100 leading-tight">{usuario?.nome}</p>
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-tight">{usuario?.empresa?.nome ?? 'Todas as empresas'}</p>
              {role && (
                <span className={cn(
                  'text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide',
                  ROLE_COLORS[role],
                )}>
                  {ROLE_LABELS[role].split(' ')[0]}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
