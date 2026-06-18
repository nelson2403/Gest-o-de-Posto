'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { cn } from '@/lib/utils/cn'
import { ArrowLeft, Download, ArrowRightLeft, Wand2 } from 'lucide-react'
import { TabExportar }   from './_components/TabExportar'
import { TabMapeamento } from './_components/TabMapeamento'
import { TabRegras }     from './_components/TabRegras'

type Tab  = 'exportar' | 'mapeamento' | 'regras'
type Cor  = 'indigo' | 'amber' | 'violet'

export default function ExportacaoDadosPage() {
  const [tab, setTab] = useState<Tab>('exportar')

  return (
    <div className="flex flex-col min-h-full">
      <Header
        title="Exportação de Dados"
        description="Exporte lançamentos do AUTOSYSTEM, gerencie mapeamento De/Para e regras de transformação"
        actions={
          <Link href="/contabil/visao-geral"
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-[12.5px]">
            <ArrowLeft className="w-3.5 h-3.5" /> Contábil
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {/* Abas */}
        <div className="flex items-center gap-1 border-b border-gray-200 mb-5">
          <TabButton active={tab === 'exportar'}   onClick={() => setTab('exportar')}
            icon={<Download      className="w-3.5 h-3.5" />} label="Exportar"           color="indigo" />
          <TabButton active={tab === 'mapeamento'} onClick={() => setTab('mapeamento')}
            icon={<ArrowRightLeft className="w-3.5 h-3.5" />} label="Mapeamento De/Para" color="amber" />
          <TabButton active={tab === 'regras'}     onClick={() => setTab('regras')}
            icon={<Wand2         className="w-3.5 h-3.5" />} label="Regras"             color="violet" />
        </div>

        {tab === 'exportar'   && (
          <TabExportar
            onIrParaMapeamento={() => setTab('mapeamento')}
            onIrParaRegras={()    => setTab('regras')}
          />
        )}
        {tab === 'mapeamento' && <TabMapeamento />}
        {tab === 'regras'     && <TabRegras />}
      </div>
    </div>
  )
}

function TabButton(props: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  color: Cor
}) {
  const { active, onClick, icon, label, color } = props
  const activeClasses: Record<Cor, string> = {
    indigo: 'border-indigo-600 text-indigo-700',
    amber:  'border-amber-600  text-amber-700',
    violet: 'border-violet-600 text-violet-700',
  }
  return (
    <button onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-4 h-9 text-[12.5px] font-semibold border-b-2 -mb-px transition-colors',
        active ? activeClasses[color] : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
