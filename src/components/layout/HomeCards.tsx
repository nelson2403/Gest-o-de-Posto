'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useAuthContext } from '@/contexts/AuthContext'
import { NAV_GROUPS } from '@/lib/nav'
import type { Role } from '@/types/database.types'
import type { Permission } from '@/lib/utils/permissions'
import type { ElementType } from 'react'

type Card = { href: string; label: string; icon: ElementType }

// Paleta de cores rotativa para os cards (ícone)
const CORES = [
  'bg-orange-100 text-orange-600',
  'bg-blue-100 text-blue-600',
  'bg-emerald-100 text-emerald-600',
  'bg-purple-100 text-purple-600',
  'bg-amber-100 text-amber-600',
  'bg-cyan-100 text-cyan-600',
  'bg-rose-100 text-rose-600',
  'bg-indigo-100 text-indigo-600',
  'bg-teal-100 text-teal-600',
  'bg-fuchsia-100 text-fuchsia-600',
]

// Achata a estrutura do menu em uma lista de páginas (cards), respeitando
// permissões e o perfil — mesma lógica de visibilidade da subbar.
function cardsVisiveis(
  canUser: (p: Permission) => boolean,
  role: Role | undefined,
): Card[] {
  const out: Card[] = []
  const seen = new Set<string>()
  const addCard = (href: string, label: string, icon: ElementType) => {
    if (href === '/' || seen.has(href)) return
    seen.add(href)
    out.push({ href, label, icon })
  }

  for (const group of NAV_GROUPS) {
    if (group.onlyForRoles && (!role || !group.onlyForRoles.includes(role))) continue
    for (const item of group.items) {
      const itemRoleOk = !item.hideForRoles || !role || !item.hideForRoles.includes(role)
      if (item.children) {
        const parentPermOk = !item.permission || canUser(item.permission)
        if (!parentPermOk || !itemRoleOk) continue
        for (const c of item.children) {
          const permOk = !c.permission || canUser(c.permission)
          const roleOk = !c.hideForRoles || !role || !c.hideForRoles.includes(role)
          if (permOk && roleOk) addCard(c.href, c.label, c.icon)
        }
      } else if (item.href) {
        const permOk = !item.permission || canUser(item.permission)
        if (permOk && itemRoleOk) addCard(item.href, item.label, item.icon)
      }
    }
  }
  return out
}

export function HomeCards({ titulo }: { titulo?: string }) {
  const { usuario, canUser } = useAuthContext()
  const role = usuario?.role as Role | undefined
  const cards = cardsVisiveis(canUser, role)

  const primeiroNome = usuario?.nome?.split(' ')[0] ?? ''

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6 md:mb-8">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
          {titulo ?? (primeiroNome ? `Olá, ${primeiroNome}!` : 'Bem-vindo')}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Escolha abaixo o que você quer fazer.
        </p>
      </div>

      {cards.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 border border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-12 text-center text-gray-400 text-sm">
          Nenhuma página disponível para o seu perfil.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {cards.map((card, i) => {
            const Icon = card.icon
            const cor = CORES[i % CORES.length]
            return (
              <Link
                key={card.href}
                href={card.href}
                className="group bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 md:p-5 flex flex-col gap-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center ${cor}`}>
                  <Icon className="w-6 h-6 md:w-7 md:h-7" />
                </div>
                <div className="flex items-end justify-between gap-2 flex-1">
                  <span className="text-[13px] md:text-[15px] font-semibold text-gray-800 dark:text-gray-100 leading-tight">
                    {card.label}
                  </span>
                  <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
