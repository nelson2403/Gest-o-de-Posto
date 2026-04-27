'use client'

import { MascaraListPage } from '@/components/mascaras/MascaraListPage'

export default function MascarasDREPage() {
  return (
    <MascaraListPage
      tipo="dre"
      titulo="Máscaras DRE"
      descricao="Configure a estrutura das máscaras de DRE"
      basePath="/mascaras/dre"
    />
  )
}
