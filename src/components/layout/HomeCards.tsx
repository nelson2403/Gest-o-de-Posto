'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useAuthContext } from '@/contexts/AuthContext'
import { SeletorPostoAtivo } from '@/components/shared/SeletorPostoAtivo'
import { NAV_GROUPS, ROLES_BAIXO_ACESSO } from '@/lib/nav'
import type { Role } from '@/types/database.types'
import type { Permission } from '@/lib/utils/permissions'
import type { ElementType } from 'react'

type Card = { href: string; label: string; icon: ElementType }
type Secao = { label: string; cards: Card[] }

// Paleta de cores rotativa para os ícones dos cards
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

// Títulos de seção mais claros (evita "Outros"/"Controle Geral")
const RENOMEAR_SECAO: Record<string, string> = {
  'Outros':         'Geral',
  'Controle Geral': 'Acessos & Controle',
}

// Achata o menu em seções (com seus cards), respeitando permissões e perfil —
// mesma lógica de visibilidade da subbar.
function secoesVisiveis(
  canUser: (p: Permission) => boolean,
  role: Role | undefined,
): Secao[] {
  const out: Secao[] = []
  const seen = new Set<string>()

  for (const group of NAV_GROUPS) {
    if (group.onlyForRoles && (!role || !group.onlyForRoles.includes(role))) continue
    const cards: Card[] = []
    const add = (href: string, label: string, icon: ElementType) => {
      if (href === '/' || seen.has(href)) return
      seen.add(href)
      cards.push({ href, label, icon })
    }
    for (const item of group.items) {
      const itemRoleOk = !item.hideForRoles || !role || !item.hideForRoles.includes(role)
      if (item.children) {
        const parentPermOk = !item.permission || canUser(item.permission)
        if (!parentPermOk || !itemRoleOk) continue
        for (const c of item.children) {
          const permOk = !c.permission || canUser(c.permission)
          const roleOk = !c.hideForRoles || !role || !c.hideForRoles.includes(role)
          if (permOk && roleOk) add(c.href, c.label, c.icon)
        }
      } else if (item.href) {
        const permOk = !item.permission || canUser(item.permission)
        if (permOk && itemRoleOk) add(item.href, item.label, item.icon)
      }
    }
    if (cards.length) out.push({ label: RENOMEAR_SECAO[group.label] ?? group.label, cards })
  }
  return out
}

// ─── Cards ──────────────────────────────────────────────────────────────────

function CardLink({ card, cor, compact }: { card: Card; cor: string; compact?: boolean }) {
  const Icon = card.icon
  return (
    <Link
      href={card.href}
      className={`group bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex ${
        compact
          ? 'items-center gap-3 p-3'
          : 'flex-col gap-3 p-4 md:p-5'
      }`}
    >
      <div className={`${compact ? 'w-10 h-10 rounded-xl' : 'w-12 h-12 md:w-14 md:h-14 rounded-2xl'} flex items-center justify-center flex-shrink-0 ${cor}`}>
        <Icon className={compact ? 'w-5 h-5' : 'w-6 h-6 md:w-7 md:h-7'} />
      </div>
      <div className={`flex items-center justify-between gap-2 flex-1 min-w-0 ${compact ? '' : 'items-end'}`}>
        <span className={`font-semibold text-gray-800 dark:text-gray-100 leading-tight ${compact ? 'text-[13px]' : 'text-[13px] md:text-[15px]'}`}>
          {card.label}
        </span>
        <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
      </div>
    </Link>
  )
}

export function HomeCards({ titulo }: { titulo?: string }) {
  const { usuario, canUser, postos_gerente_info, posto_ativo_id, setPostoAtivo } = useAuthContext()
  const role = usuario?.role as Role | undefined
  const secoes = secoesVisiveis(canUser, role)
  const mostrarSeletorPosto = role === 'gerente' && postos_gerente_info.length > 0
  // Perfis de baixo acesso (poucas páginas) veem lista única e limpa;
  // ADMs veem agrupado por seção (menos poluição com muitas páginas).
  const agrupar = !(role && ROLES_BAIXO_ACESSO.includes(role))

  const primeiroNome = usuario?.nome?.split(' ')[0] ?? ''
  const totalCards = secoes.reduce((s, sec) => s + sec.cards.length, 0)

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

      {/* Seletor de posto do gerente — fonte única para todas as telas */}
      {mostrarSeletorPosto && (
        <div className="mb-6">
          <SeletorPostoAtivo
            postos={postos_gerente_info}
            value={posto_ativo_id}
            onChange={setPostoAtivo}
            label={postos_gerente_info.length > 1 ? 'Você está trabalhando no posto' : 'Seu posto'}
          />
          {postos_gerente_info.length > 1 && (
            <p className="text-[12px] text-gray-400 mt-1.5 px-1">
              Tudo que você lançar (tanques, fiscal, preços, patrocínios) vai para o posto selecionado acima.
            </p>
          )}
        </div>
      )}

      {totalCards === 0 ? (
        <div className="bg-white dark:bg-gray-900 border border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-12 text-center text-gray-400 text-sm">
          Nenhuma página disponível para o seu perfil.
        </div>
      ) : agrupar ? (
        // ── ADMs: agrupado por seção ──────────────────────────────────────────
        <div className="space-y-7">
          {(() => { let n = 0; return secoes.map(sec => (
            <section key={sec.label}>
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2.5">{sec.label}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 md:gap-3">
                {sec.cards.map(card => (
                  <CardLink key={card.href} card={card} cor={CORES[n++ % CORES.length]} compact />
                ))}
              </div>
            </section>
          )) })()}
        </div>
      ) : (
        // ── Gerente/operadores: lista única, cards grandes ────────────────────
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {(() => { let n = 0; return secoes.flatMap(sec => sec.cards).map(card => (
            <CardLink key={card.href} card={card} cor={CORES[n++ % CORES.length]} />
          )) })()}
        </div>
      )}
    </div>
  )
}
