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

// Busca todos os grids do mirror para um intervalo de empresa/data (paginado)
async function fetchGridsMirror(
  empresas: number[],
  dataIni: string,
  dataFim: string,
  pageSize = 1000,
): Promise<number[]> {
  const sb = getSupabase()
  const grids: number[] = []
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from('as_movto')
      .select('grid')
      .in('empresa', empresas)
      .gte('data', dataIni)
      .lte('data', dataFim)
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`fetchGridsMirror: ${error.message}`)
    if (!data || data.length === 0) break
    grids.push(...data.map((r: any) => Number(r.grid)))
    if (data.length < pageSize) break
    from += pageSize
  }
  return grids
}

// Remove do mirror registros deletados no AUTOSYSTEM para o intervalo empresa/data
export async function deletarOrfaos(
  empresas: number[],
  dataIni: string,
  dataFim: string,
  gridsValidos: Set<number>,
  tamLote = 500,
): Promise<number> {
  const mirrorGrids = await fetchGridsMirror(empresas, dataIni, dataFim)
  const deletar = mirrorGrids.filter(g => !gridsValidos.has(g))
  if (deletar.length === 0) return 0

  const sb = getSupabase()
  for (let i = 0; i < deletar.length; i += tamLote) {
    const lote = deletar.slice(i, i + tamLote)
    const { error } = await sb.from('as_movto').delete().in('grid', lote)
    if (error) throw new Error(`deletarOrfaos lote ${i}: ${error.message}`)
  }
  return deletar.length
}
