import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── PUT — substitui todos os produtos vinculados à categoria ───────────────
//
// Body: { produtos: [{ grid: number, nome: string }] }
//
// DELETE + INSERT em batch (sem transação). Produtos removidos do array
// saem da tabela; novos entram. Match por (categoria_id, produto_grid).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: categoriaId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Partial<{
    produtos: { grid: number; nome: string }[]
  }>

  const produtos = Array.isArray(body.produtos) ? body.produtos : []
  // Valida e remove duplicados por grid
  const seen = new Set<number>()
  const limpos: { grid: number; nome: string }[] = []
  for (const p of produtos) {
    const grid = Number(p?.grid)
    const nome = String(p?.nome ?? '').trim()
    if (!isFinite(grid) || grid <= 0 || !nome) {
      return NextResponse.json({ error: 'produtos[*].grid e produtos[*].nome são obrigatórios' }, { status: 400 })
    }
    if (seen.has(grid)) continue
    seen.add(grid)
    limpos.push({ grid, nome })
  }

  const admin = createAdminClient()

  // Garante que a categoria existe
  const { data: cat, error: erCat } = await admin
    .from('comissio_categorias_produto')
    .select('id')
    .eq('id', categoriaId)
    .single()
  if (erCat || !cat) return NextResponse.json({ error: 'Categoria não encontrada' }, { status: 404 })

  const { error: erDel } = await admin
    .from('comissio_categoria_produtos')
    .delete()
    .eq('categoria_id', categoriaId)
  if (erDel) return NextResponse.json({ error: erDel.message }, { status: 500 })

  if (limpos.length > 0) {
    const { error: erIns } = await admin
      .from('comissio_categoria_produtos')
      .insert(limpos.map(p => ({
        categoria_id: categoriaId,
        produto_grid: p.grid,
        produto_nome: p.nome,
      })))
    if (erIns) return NextResponse.json({ error: erIns.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, total: limpos.length })
}
