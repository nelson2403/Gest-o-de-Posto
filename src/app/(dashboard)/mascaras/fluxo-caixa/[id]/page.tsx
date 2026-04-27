'use client'

import { use } from 'react'
import { MascaraEditor } from '@/components/mascaras/MascaraEditor'

export default function MascaraFluxoCaixaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <MascaraEditor
      tipo="fluxo_caixa"
      tituloTipo="Fluxo de Caixa"
      basePath="/mascaras/fluxo-caixa"
      mascaraId={id}
    />
  )
}
