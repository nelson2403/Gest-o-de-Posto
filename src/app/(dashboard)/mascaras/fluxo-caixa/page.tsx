'use client'

import { MascaraListPage } from '@/components/mascaras/MascaraListPage'

export default function MascarasFluxoCaixaPage() {
  return (
    <MascaraListPage
      tipo="fluxo_caixa"
      titulo="Máscaras Fluxo de Caixa"
      descricao="Configure a estrutura das máscaras de Fluxo de Caixa"
      basePath="/mascaras/fluxo-caixa"
    />
  )
}
