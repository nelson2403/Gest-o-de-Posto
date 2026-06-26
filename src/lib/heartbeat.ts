import { createAdminClient } from '@/lib/supabase/admin'

// Registra um "batimento" de execução de cron/integração. Nunca lança — uma
// falha de heartbeat não pode derrubar o cron em si.
export async function registrarHeartbeat(
  servico: string,
  status: 'ok' | 'erro' | 'parcial',
  detalhe?: Record<string, unknown>,
  duracaoMs?: number,
): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('integracao_heartbeat').insert({
      servico,
      status,
      detalhe:    detalhe ?? null,
      duracao_ms: duracaoMs ?? null,
    })
  } catch {
    /* ignora — heartbeat é best-effort */
  }
}
