'use client'

import { use } from 'react'
import { MascaraEditor } from '@/components/mascaras/MascaraEditor'

export default function MascaraDREDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <MascaraEditor
      tipo="dre"
      tituloTipo="DRE"
      basePath="/mascaras/dre"
      mascaraId={id}
    />
  )
}
