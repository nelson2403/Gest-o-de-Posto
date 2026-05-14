import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { queryAS } from '@/lib/autosystem'

export const dynamic = 'force-dynamic'

// GET /api/estoque/produto-por-barras?codigo=XXXX&empresaId=YYY
// Busca um produto pelo código de barras no AUTOSYSTEM
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const codigo    = searchParams.get('codigo')?.trim()
  const empresaId = Number(searchParams.get('empresaId'))

  if (!codigo || !empresaId) {
    return NextResponse.json({ error: 'Parâmetros ausentes' }, { status: 400 })
  }

  // Tenta descobrir qual coluna de código de barras existe na tabela produto
  const colunas = await queryAS(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'produto'
       AND column_name IN ('cod_barras','ean','ean13','codigo_barras','barcode','cod_ean')
     LIMIT 5`,
    [],
  )

  if (!colunas.length) {
    return NextResponse.json({ produto_id: null, mensagem: 'Tabela produto não possui coluna de código de barras' })
  }

  const coluna = (colunas[0] as any).column_name as string

  // Busca o produto pelo código de barras
  const rows = await queryAS(
    `SELECT p.grid::bigint AS produto_id,
            p.nome::bytea  AS nome_b
     FROM produto p
     JOIN estoque_produto ep ON ep.produto = p.grid
     WHERE ep.empresa = $1
       AND p.${coluna}::text = $2
     LIMIT 1`,
    [empresaId, codigo],
  )

  if (!rows.length) {
    return NextResponse.json({ produto_id: null })
  }

  const row = rows[0] as any
  return NextResponse.json({
    produto_id: Number(row.produto_id),
  })
}
