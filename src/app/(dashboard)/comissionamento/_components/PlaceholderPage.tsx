'use client'

import { Header } from '@/components/layout/Header'
import { Construction, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface Feature {
  titulo: string
  descricao: string
}

interface PlaceholderPageProps {
  titulo:         string
  subtitulo?:     string
  icone:          React.ElementType
  corAccent:      'blue' | 'emerald' | 'rose' | 'amber' | 'purple' | 'sky' | 'indigo'
  // Lista de funcionalidades previstas para esta tela. Apenas informativa
  // — quando o módulo for desenvolvido, este componente é substituído.
  features:       Feature[]
  voltarPara?:    { href: string; label: string }
}

const ACCENT: Record<PlaceholderPageProps['corAccent'], { bg: string; texto: string; borda: string }> = {
  blue:    { bg: 'bg-blue-50',    texto: 'text-blue-600',    borda: 'border-blue-200' },
  emerald: { bg: 'bg-emerald-50', texto: 'text-emerald-600', borda: 'border-emerald-200' },
  rose:    { bg: 'bg-rose-50',    texto: 'text-rose-600',    borda: 'border-rose-200' },
  amber:   { bg: 'bg-amber-50',   texto: 'text-amber-600',   borda: 'border-amber-200' },
  purple:  { bg: 'bg-purple-50',  texto: 'text-purple-600',  borda: 'border-purple-200' },
  sky:     { bg: 'bg-sky-50',     texto: 'text-sky-600',     borda: 'border-sky-200' },
  indigo:  { bg: 'bg-indigo-50',  texto: 'text-indigo-600',  borda: 'border-indigo-200' },
}

export function PlaceholderPage({ titulo, subtitulo, icone: Icone, corAccent, features, voltarPara }: PlaceholderPageProps) {
  const cores = ACCENT[corAccent]
  return (
    <div className="flex flex-col min-h-full">
      <Header
        title={titulo}
        description={subtitulo ?? 'Módulo de comissionamento'}
        actions={
          voltarPara && (
            <Link
              href={voltarPara.href}
              className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-[12.5px]"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {voltarPara.label}
            </Link>
          )
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        {/* Banner em desenvolvimento */}
        <div className={`flex items-center gap-3 p-4 rounded-xl border ${cores.bg} ${cores.borda}`}>
          <div className={`w-10 h-10 rounded-lg ${cores.bg} flex items-center justify-center flex-shrink-0`}>
            <Construction className={`w-5 h-5 ${cores.texto}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-[13.5px] font-semibold ${cores.texto}`}>Em desenvolvimento</p>
            <p className="text-[12px] text-gray-600">
              Este módulo está sendo construído. Abaixo, as funcionalidades previstas para essa tela.
            </p>
          </div>
        </div>

        {/* Hero / preview */}
        <div className="rounded-xl bg-white border border-gray-200 p-6">
          <div className="flex items-start gap-4">
            <div className={`w-14 h-14 rounded-2xl ${cores.bg} flex items-center justify-center flex-shrink-0`}>
              <Icone className={`w-7 h-7 ${cores.texto}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[18px] font-bold text-gray-900 tracking-tight">{titulo}</h2>
              {subtitulo && <p className="text-[13px] text-gray-500 mt-0.5">{subtitulo}</p>}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
            {features.map(f => (
              <div key={f.titulo} className="rounded-lg border border-gray-100 bg-gray-50/50 p-3.5">
                <p className="text-[13px] font-semibold text-gray-800">{f.titulo}</p>
                <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">{f.descricao}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
