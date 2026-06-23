import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface Categoria {
  id:            string
  nome:          string
  descricao:     string
  cor:           string
  criado_em:     string
  atualizado_em: string
  qtd_produtos?: number
}

// ─── GET — lista categorias com contagem de produtos ────────────────────────
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const [catResp, prodResp] = await Promise.all([
    admin.from('comissio_categorias_produto').select('*').order('nome'),
    admin.from('comissio_categoria_produtos').select('categoria_id'),
  ])

  if (catResp.error) return NextResponse.json({ error: catResp.error.message }, { status: 500 })

  const counts = new Map<string, number>()
  for (const r of prodResp.data ?? []) {
    counts.set(r.categoria_id as string, (counts.get(r.categoria_id as string) ?? 0) + 1)
  }

  const categorias: Categoria[] = (catResp.data ?? []).map((c: any) => ({
    ...c,
    qtd_produtos: counts.get(c.id) ?? 0,
  }))
  return NextResponse.json({ categorias })
}

// ─── POST — cria categoria ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Partial<{
    nome: string; descricao: string; cor: string
  }>

  if (!body.nome?.trim()) return NextResponse.json({ error: 'nome é obrigatório' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('comissio_categorias_produto')
    .insert({
      nome:       body.nome.trim(),
      descricao:  body.descricao?.trim() ?? '',
      cor:        body.cor?.trim() || '#6366f1',
      criado_por: user.id,
    })
    .select()
    .single()

  if (error) {
    // Conflito de unique index (lower(nome))
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Já existe uma categoria com esse nome' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ categoria: data })
}
