import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { queryAS } from '@/lib/autosystem'

export const dynamic = 'force-dynamic'

// GET /api/estoque/debug-barras?codigo=7797394001272
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const codigo = searchParams.get('codigo') ?? ''

  // 1. Todas as colunas da tabela produto
  const colunasProduto = await queryAS(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_name = 'produto'
     ORDER BY ordinal_position`,
    [],
  )

  // 2. Tabelas que podem conter código de barras
  const tabelasBarras = await queryAS(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND (table_name ILIKE '%barr%'
         OR table_name ILIKE '%ean%'
         OR table_name ILIKE '%codigo%'
         OR table_name ILIKE '%produto_cod%')
     ORDER BY table_name`,
    [],
  )

  // 3. Busca texto livre por colunas com "barr" ou "ean" em qualquer tabela
  const colunasBarras = await queryAS(
    `SELECT table_name, column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND (column_name ILIKE '%barr%'
         OR column_name ILIKE '%ean%'
         OR column_name ILIKE '%cod_bar%'
         OR column_name ILIKE '%barcode%')
     ORDER BY table_name, column_name`,
    [],
  )

  // 4. Se encontrou colunas, tenta buscar o código informado
  let buscaDireta: any[] = []
  if (codigo && colunasBarras.length) {
    const { table_name, column_name } = colunasBarras[0] as any
    try {
      buscaDireta = await queryAS(
        `SELECT * FROM ${table_name} WHERE ${column_name}::text = $1 LIMIT 3`,
        [codigo],
      )
    } catch (e: any) {
      buscaDireta = [{ erro: e.message }]
    }
  }

  // 5. Amostra da tabela produto (3 registros) para ver os valores reais
  const amostraProduto = await queryAS(
    `SELECT * FROM produto LIMIT 3`,
    [],
  )

  return NextResponse.json({
    colunas_produto: colunasProduto,
    tabelas_com_barras: tabelasBarras,
    colunas_barras_encontradas: colunasBarras,
    busca_direta_resultado: buscaDireta,
    amostra_produto: amostraProduto,
  })
}
