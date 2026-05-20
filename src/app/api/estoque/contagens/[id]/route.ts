import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { data: contagem, error } = await supabase
    .from('contagens_estoque')
    .select('*, contagens_estoque_itens(*)')
    .eq('id', id)
    .single()

  if (error || !contagem) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ contagem })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { data_contagem, itens } = body

  if (!itens?.length) return NextResponse.json({ error: 'Itens ausentes' }, { status: 400 })

  const admin = createAdminClient()

  const { error: errUp } = await admin
    .from('contagens_estoque')
    .update({ data_contagem })
    .eq('id', id)
  if (errUp) return NextResponse.json({ error: errUp.message }, { status: 500 })

  const { error: errDel } = await admin
    .from('contagens_estoque_itens')
    .delete()
    .eq('contagem_id', id)
  if (errDel) return NextResponse.json({ error: errDel.message }, { status: 500 })

  const { error: errIns } = await admin
    .from('contagens_estoque_itens')
    .insert(itens.map((it: any) => ({
      contagem_id:  id,
      produto_id:   it.produto_id,
      produto_nome: it.produto_nome,
      unid_med:     it.unid_med,
      qtd_sistema:  it.qtd_sistema,
      custo_medio:  it.custo_medio,
      qtd_contada:  it.qtd_contada ?? null,
    })))
  if (errIns) return NextResponse.json({ error: errIns.message }, { status: 500 })

  return NextResponse.json({ id })
}
