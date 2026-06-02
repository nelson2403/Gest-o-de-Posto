import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// PATCH — marca um ou todos os postos/produtos de um portal como atualizados
// Body: { itens: [{ posto_id, produto, preco }] }  (array de itens a marcar)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id: portal_id } = await params
  const { itens } = await req.json() as {
    itens: { posto_id: string; produto: string; preco: number }[]
  }

  if (!itens?.length) return NextResponse.json({ error: 'itens é obrigatório' }, { status: 400 })

  const agora = new Date().toISOString()
  const admin = createAdminClient()

  const rows = itens.map(it => ({
    portal_id,
    posto_id:       it.posto_id,
    produto:        it.produto,
    preco_no_portal: it.preco,
    atualizado_em:  agora,
    usuario_id:     user.id,
  }))

  const { error } = await admin
    .from('portais_frotas_status')
    .upsert(rows, { onConflict: 'portal_id,posto_id,produto' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, atualizados: rows.length })
}
