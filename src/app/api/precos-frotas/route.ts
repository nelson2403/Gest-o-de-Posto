import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — retorna tudo: postos com seus preços, portais e status de atualização
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const [
    postosRes,
    { data: precos },
    { data: portais },
    { data: status },
    { data: vinculacoes },
  ] = await Promise.all([
    admin.from('postos').select('id, nome, tem_cartao_desconto').eq('ativo', true).order('nome'),
    admin.from('precos_combustivel').select('*').order('produto'),
    admin.from('portais_frotas').select('*').eq('ativo', true).order('nome'),
    admin.from('portais_frotas_status').select('*'),
    admin.from('portais_frotas_postos').select('portal_id, posto_id'),
  ])

  // Fallback caso a coluna tem_cartao_desconto ainda não exista (migration 135)
  let postos: any[] | null = postosRes.data
  if (postosRes.error) {
    const { data } = await admin.from('postos').select('id, nome').eq('ativo', true).order('nome')
    postos = data
  }

  return NextResponse.json({ postos, precos, portais, status, vinculacoes })
}

// POST — salva (upsert) um preço de combustível para um posto/produto
export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { posto_id, produto, preco } = await req.json()
  if (!posto_id || !produto || preco == null) {
    return NextResponse.json({ error: 'posto_id, produto e preco são obrigatórios' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('precos_combustivel')
    .upsert(
      { posto_id, produto, preco: Number(preco), atualizado_em: new Date().toISOString(), atualizado_por: user.id },
      { onConflict: 'posto_id,produto' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ preco: data })
}
