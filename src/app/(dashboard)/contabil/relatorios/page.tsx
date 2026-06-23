'use client'

import { Header } from '@/components/layout/Header'
import { RelatoriosGerenciaisTab } from '@/components/analitico/RelatoriosGerenciaisTab'

export default function ContabilRelatoriosPage() {
  return (
    <div className="animate-fade-in">
      <div className="print:hidden">
        <Header
          title="Contábil — Relatórios"
          description="DRE, Balanço Financeiro e demais relatórios gerenciais"
        />
      </div>

      <div className="p-3 md:p-6 print:p-0">
        <RelatoriosGerenciaisTab />
      </div>
    </div>
  )
}
