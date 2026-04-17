import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { config } from './config'

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { persistSession: false },
    })
  }
  return client
}

// Upsert em lotes de 500 para não sobrecarregar o Supabase
export async function upsertLotes(
  tabela: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  tamLote = 500,
): Promise<number> {
  if (rows.length === 0) return 0
  const sb = getSupabase()
  let total = 0
  for (let i = 0; i < rows.length; i += tamLote) {
    const lote = rows.slice(i, i + tamLote)
    const { error } = await sb.from(tabela).upsert(lote, { onConflict })
    if (error) throw new Error(`upsert ${tabela} lote ${i}: ${error.message}`)
    total += lote.length
  }
  return total
}
