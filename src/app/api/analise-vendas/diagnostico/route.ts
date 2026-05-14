import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { queryAS } from '@/lib/autosystem'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tabelas = ['produto', 'lancto', 'estoque_lancto', 'estoque_valor', 'estoque_produto']

  const rows = await queryAS<{ table_name: string; column_name: string; data_type: string }>(
    `SELECT table_name, column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])
     ORDER BY table_name, ordinal_position`,
    [tabelas],
  )

  const por_tabela: Record<string, { column: string; type: string }[]> = {}
  for (const r of rows) {
    if (!por_tabela[r.table_name]) por_tabela[r.table_name] = []
    por_tabela[r.table_name].push({ column: r.column_name, type: r.data_type })
  }

  // Amostra de um lancto real para ver os valores
  const amostraLancto = await queryAS(
    `SELECT * FROM lancto WHERE operacao = 'V' LIMIT 3`
  )

  // Amostra estoque_lancto
  const amostraEsqLancto = await queryAS(
    `SELECT * FROM estoque_lancto LIMIT 3`
  )

  // Amostra estoque_valor
  const amostraEstqValor = await queryAS(
    `SELECT * FROM estoque_valor LIMIT 3`
  )

  // Amostra produto (verificar colunas de preço)
  const amostraProduto = await queryAS(
    `SELECT * FROM produto LIMIT 2`
  )

  return NextResponse.json({
    colunas: por_tabela,
    amostraLancto,
    amostraEsqLancto,
    amostraEstqValor,
    amostraProduto,
  })
}
