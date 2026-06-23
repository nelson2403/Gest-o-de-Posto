'use client'

import { Header } from '@/components/layout/Header'
import { BookOpen, Construction } from 'lucide-react'

export default function ContabilVisaoGeralPage() {
  return (
    <div className="flex flex-col min-h-full">
      <Header
        title="Contábil — Visão Geral"
        description="Painel contábil — DRE, conciliações e integração com o sistema fiscal"
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">

        {/* Banner em desenvolvimento */}
        <div className="flex items-center gap-3 p-4 rounded-xl border bg-amber-50 border-amber-200">
          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Construction className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-semibold text-amber-700">Em desenvolvimento</p>
            <p className="text-[12px] text-gray-600">
              Este módulo está sendo construído. Abaixo, as funcionalidades previstas para essa tela.
            </p>
          </div>
        </div>

        {/* Hero / preview */}
        <div className="rounded-xl bg-white border border-gray-200 p-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-7 h-7 text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[18px] font-bold text-gray-900 tracking-tight">Painel Contábil</h2>
              <p className="text-[13px] text-gray-500 mt-0.5">
                Centraliza informações contábeis e integrações com o módulo fiscal.
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-3.5">
              <p className="text-[13px] font-semibold text-gray-800">DRE Contábil</p>
              <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">
                Demonstração do Resultado do Exercício a partir dos lançamentos do AUTOSYSTEM, agrupados pela máscara contábil.
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-3.5">
              <p className="text-[13px] font-semibold text-gray-800">Conciliação contábil ↔ fiscal</p>
              <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">
                Compara o resultado contábil com o resultado fiscal (apuração), destacando ajustes e divergências.
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-3.5">
              <p className="text-[13px] font-semibold text-gray-800">Exportação para escritório</p>
              <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">
                Gera arquivos prontos (XLSX/CSV/PDF) com lançamentos do mês para envio ao escritório de contabilidade.
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-3.5">
              <p className="text-[13px] font-semibold text-gray-800">Plano de contas</p>
              <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">
                Espelha o plano de contas do AUTOSYSTEM com filtros por nível e busca, para conferência rápida.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
