import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET /api/contabil/plano-contas?search=...
// DELETE /api/contabil/plano-contas?all=1    (limpa o plano inteiro)
//
// O endpoint de importação em batch fica em /plano-contas/importar.

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const search = (new URL(req.url).searchParams.get('search') ?? '').trim()

  let q = supabase
    .from('contabil_plano_contas')
    .select('*')
    .order('codigo', { ascending: true })

  if (search) {
    q = q.or(`codigo.ilike.%${search}%,descricao.ilike.%${search}%`)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contas: data ?? [] })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  if (new URL(req.url).searchParams.get('all') !== '1') {
    return NextResponse.json({ error: 'Para apagar tudo, use ?all=1' }, { status: 400 })
  }

  // O .neq abaixo garante que todas as linhas matem o filtro (id é uuid sempre != string vazia)
  const { error, count } = await supabase
    .from('contabil_plano_contas')
    .delete({ count: 'exact' })
    .neq('id', '00000000-0000-0000-0000-000000000000')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, removidas: count ?? 0 })
}
