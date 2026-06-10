import { useEffect, useRef } from 'react'

const STORAGE_KEY = 'last_sync_divergencias'
const INTERVALO_MS = 15 * 60 * 1000 // 15 minutos

/**
 * Sincroniza divergências ao entrar no sistema, mas no máximo 1x a cada 15 min
 * (a sincronização é pesada — evita rodar a cada navegação/recarga e sobrecarregar).
 */
export function useSyncDivergencias() {
  const syncExecuted = useRef(false)

  useEffect(() => {
    if (syncExecuted.current) return
    syncExecuted.current = true

    try {
      const ultimo = Number(localStorage.getItem(STORAGE_KEY) || 0)
      if (Date.now() - ultimo < INTERVALO_MS) return // já sincronizou recentemente
      localStorage.setItem(STORAGE_KEY, String(Date.now()))
    } catch {
      // localStorage indisponível — segue mesmo assim
    }

    fetch('/api/conciliadores/sincronizar', { method: 'POST' })
      .catch(e => console.error('[SYNC] Erro ao sincronizar divergências:', e))
  }, [])
}
