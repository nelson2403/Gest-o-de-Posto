import { useEffect, useRef } from 'react'

/**
 * Hook que sincroniza divergências uma única vez quando o usuário entra no sistema
 * Evita múltiplas chamadas na mesma sessão
 */
export function useSyncDivergencias() {
  const syncExecuted = useRef(false)

  useEffect(() => {
    if (syncExecuted.current) return

    const syncDivergencias = async () => {
      try {
        await fetch('/api/conciliadores/sincronizar', { method: 'POST' })
        syncExecuted.current = true
      } catch (e) {
        console.error('[SYNC] Erro ao sincronizar divergências:', e)
      }
    }

    syncDivergencias()
  }, [])
}
