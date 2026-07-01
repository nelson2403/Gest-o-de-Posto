'use client'

import { MapPin } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface PostoOpt { id: string; nome: string }

interface Props {
  postos: PostoOpt[]
  value: string
  onChange: (id: string) => void
  /** Texto acima do nome do posto. Ex.: "Lançando preços para". */
  label?: string
  className?: string
}

/**
 * Indicador + seletor de "posto ativo" para telas usadas por gerentes com mais
 * de um posto. Deixa SEMPRE visível em qual posto a informação está sendo lançada.
 * - 1 posto: mostra só o nome (sem troca).
 * - 2+ postos: mostra o posto ativo em destaque + botões para trocar.
 */
export function SeletorPostoAtivo({ postos, value, onChange, label = 'Posto', className }: Props) {
  if (!postos.length) return null
  const ativo = postos.find(p => p.id === value) ?? postos[0]
  const multi = postos.length > 1

  return (
    <div className={cn('bg-orange-50 border border-orange-200 rounded-xl p-3', multi && 'space-y-2.5', className)}>
      <div className="flex items-center gap-2.5">
        <div className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
          multi ? 'bg-orange-500' : 'bg-orange-100',
        )}>
          <MapPin className={cn('w-[18px] h-[18px]', multi ? 'text-white' : 'text-orange-600')} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-500">{label}</p>
          <p className="text-[15px] font-bold text-orange-900 truncate leading-tight">{ativo.nome}</p>
        </div>
      </div>

      {multi && (
        <div className="flex flex-wrap gap-1.5">
          {postos.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(p.id)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors',
                p.id === ativo.id
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300 hover:text-orange-600',
              )}
            >
              {p.nome}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
