import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface CategoriaProdutoLink {
  produto_grid: number
  produto_nome: string
}

// ─── GET — categoria + produtos vinculados ──────────────────────────────────
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const [catResp, prodResp] = await Promise.all([
    admin.from('comissio_categorias_produto').select('*').eq('id', id).single(),
    admin
      .from('comissio_categoria_produtos')
      .select('produto_grid, produto_nome')
      .eq('categoria_id', id)
      .order('produto_nome'),
  ])

  if (catResp.error || !catResp.data) {
    return NextResponse.json({ error: 'Categoria não encontrada' }, { status: 404 })
  }

  const produtos: CategoriaProdutoLink[] = (prodResp.data ?? []).map((r: any) => ({
    produto_grid: Number(r.produto_grid),
    produto_nome: String(r.produto_nome),
  }))

  return NextResponse.json({ categoria: catResp.data, produtos })
}

// ─── PATCH — atualiza categoria ─────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Partial<{
    nome: string; descricao: string; cor: string
  }>

  const updates: Record<string, unknown> = {}
  if (body.nome !== undefined) {
    if (!body.nome.trim()) return NextResponse.json({ error: 'nome não pode ser vazio' }, { status: 400 })
    updates.nome = body.nome.trim()
  }
  if (body.descricao !== undefined) updates.descricao = body.descricao.trim()
  if (body.cor !== undefined)        updates.cor        = body.cor.trim() || '#6366f1'

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'nenhum campo para atualizar' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('comissio_categorias_produto')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Já existe uma categoria com esse nome' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Categoria não encontrada' }, { status: 404 })
  return NextResponse.json({ categoria: data })
}

// ─── DELETE ─────────────────────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('comissio_categorias_produto')
    .delete()
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
