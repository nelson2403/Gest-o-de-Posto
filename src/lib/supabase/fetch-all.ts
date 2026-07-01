/* eslint-disable @typescript-eslint/no-explicit-any */

// Pagina uma query Supabase em blocos para trazer TODAS as linhas, contornando
// o limite padrão de 1000 do PostgREST. Use sempre que precisar processar/contar
// o conjunto COMPLETO (ex.: reconciliações, manifestos) — nunca confie no fetch
// único, que silenciosamente corta em 1000.
//
//   const linhas = await fetchAll((from, to) =>
//     admin.from('tarefas').select('id, status').eq('x', y).range(from, to))
//
export async function fetchAll<T = any>(
  builder: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  tamanhoPagina = 1000,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += tamanhoPagina) {
    const { data, error } = await builder(from, from + tamanhoPagina - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < tamanhoPagina) break
  }
  return out
}
