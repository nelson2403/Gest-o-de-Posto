'use client'

import { useSyncDivergencias } from '@/hooks/useSyncDivergencias'

/**
 * Componente que dispara sincronização de divergências ao entrar no dashboard
 * Executa uma única vez por sessão
 */
export function DashboardSync() {
  useSyncDivergencias()
  return null
}
