'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { useAuthContext } from '@/contexts/AuthContext'

// Botão "Voltar" para a home de cards. Aparece para todos os perfis que NÃO têm
// a subbar (ou seja, todos menos o master), quando estão dentro de alguma página.
export function BotaoVoltar() {
  const pathname = usePathname()
  const { usuario } = useAuthContext()
  const role = usuario?.role

  if (!role || role === 'master') return null  // master navega pela subbar
  if (pathname === '/') return null            // já está na home de cards

  return (
    <div className="sticky top-0 z-20 bg-gray-50/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 px-3 md:px-6 py-2 print:hidden">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar
      </Link>
    </div>
  )
}
