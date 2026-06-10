/* eslint-disable @typescript-eslint/no-explicit-any */

// Retorna os postos vinculados a um gerente (tabela de junção);
// se não houver vínculos na junção, usa o posto_fechamento_id legado.
export async function getPostosGerente(
  sb: any,
  userId: string,
  postoFechamentoId?: string | null,
): Promise<string[]> {
  const { data } = await sb
    .from('usuario_postos_gerente')
    .select('posto_id')
    .eq('usuario_id', userId)

  const ids = (data ?? []).map((v: any) => v.posto_id as string)
  if (ids.length) return ids
  return postoFechamentoId ? [postoFechamentoId] : []
}
