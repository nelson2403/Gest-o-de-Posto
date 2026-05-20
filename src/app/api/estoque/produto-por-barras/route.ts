import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { queryAS } from '@/lib/autosystem'

export const dynamic = 'force-dynamic'

// GET /api/estoque/produto-por-barras?codigo=XXXX&empresaId=YYY
// Coluna confirmada via debug: produto.codigo_barra (text)
// Tabela adicional: produto_codigo_barra (produto FK, codigo_barra text)
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

  // 1. Coluna principal: produto.codigo_barra com filtro de empresa
  try {
    const rows = await queryAS(
      `SELECT p.grid::bigint AS produto_id
       FROM produto p
       JOIN estoque_produto ep ON ep.produto = p.grid AND ep.empresa = $1
       WHERE p.codigo_barra::text = $2
       LIMIT 1`,
      [empresaId, codigo],
    )
    if (rows.length) {
      return NextResponse.json({ produto_id: Number((rows[0] as any).produto_id) })
    }
  } catch {}

  // 2. Tabela de múltiplos códigos: produto_codigo_barra
  try {
    const rows = await queryAS(
      `SELECT pcb.produto::bigint AS produto_id
       FROM produto_codigo_barra pcb
       JOIN estoque_produto ep ON ep.produto = pcb.produto AND ep.empresa = $1
       WHERE pcb.codigo_barra::text = $2
       LIMIT 1`,
      [empresaId, codigo],
    )
    if (rows.length) {
      return NextResponse.json({ produto_id: Number((rows[0] as any).produto_id) })
    }
  } catch {}

  // 3. Fallback: produto.codigo_barra sem filtro de empresa
  //    (produto cadastrado mas sem estoque registrado nessa empresa)
  try {
    const rows = await queryAS(
      `SELECT grid::bigint AS produto_id
       FROM produto
       WHERE codigo_barra::text = $1
       LIMIT 1`,
      [codigo],
    )
    if (rows.length) {
      return NextResponse.json({ produto_id: Number((rows[0] as any).produto_id) })
    }
  } catch {}

  // 4. Fallback: produto_codigo_barra sem filtro de empresa
  try {
    const rows = await queryAS(
      `SELECT produto::bigint AS produto_id
       FROM produto_codigo_barra
       WHERE codigo_barra::text = $1
       LIMIT 1`,
      [codigo],
    )
    if (rows.length) {
      return NextResponse.json({ produto_id: Number((rows[0] as any).produto_id) })
    }
  } catch {}

  return NextResponse.json({ produto_id: null })
}
