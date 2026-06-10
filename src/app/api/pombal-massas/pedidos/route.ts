import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPostosGerente } from '@/lib/postos-gerente'

const ROLES = ['master', 'adm_financeiro', 'gerente']

async function autorizar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado', status: 401 as const }
  const { data: u } = await supabase.from('usuarios').select('role, posto_fechamento_id').eq('id', user.id).single()
  if (!u || !ROLES.includes(u.role)) return { erro: 'Sem permissão', status: 403 as const }
  const postos = u.role === 'gerente' ? await getPostosGerente(supabase, user.id, u.posto_fechamento_id) : []
  return { user, role: u.role, postoId: u.posto_fechamento_id as string | null, postos }
}

// GET — lista pedidos (gerente vê só seu posto; master/adm veem todos)
export async function GET(req: NextRequest) {
  const auth = await autorizar()
  if ('erro' in auth) return NextResponse.json({ error: auth.erro }, { status: auth.status })

  const status = new URL(req.url).searchParams.get('status')
  const admin = createAdminClient()

  let q = admin
    .from('salgados_pedidos')
    .select(`
      id, status, observacao, data_solicitacao, data_entrega, posto_id,
      posto:postos(nome),
      itens:salgados_pedido_itens(id, quantidade, preco_unitario, salgado:salgados(id, nome, unidade))
    `)
    .order('data_solicitacao', { ascending: false })
    .limit(300)

  if (auth.role === 'gerente') q = q.in('posto_id', auth.postos.length ? auth.postos : ['__none__'])
  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pedidos: data ?? [] })
}

// POST — cria pedido (solicitação)
export async function POST(req: NextRequest) {
  const auth = await autorizar()
  if ('erro' in auth) return NextResponse.json({ error: auth.erro }, { status: auth.status })

  const body = await req.json() as {
    posto_id?: string
    observacao?: string
    itens: { salgado_id: string; quantidade: number }[]
  }

  // gerente pede para um dos postos dele; master/adm escolhe qualquer
  let postoId: string | null
  if (auth.role === 'gerente') {
    postoId = body.posto_id || auth.postos[0] || null
    if (!postoId || !auth.postos.includes(postoId)) {
      return NextResponse.json({ error: 'Selecione uma loja válida (um dos seus postos)' }, { status: 400 })
    }
  } else {
    postoId = body.posto_id ?? null
  }
  if (!postoId) return NextResponse.json({ error: 'Loja (posto) obrigatória' }, { status: 400 })

  const itens = (body.itens ?? []).filter(i => i.salgado_id && Number(i.quantidade) > 0)
  if (!itens.length) return NextResponse.json({ error: 'Inclua ao menos um salgado' }, { status: 400 })

  const admin = createAdminClient()

  // preço de venda atual de cada salgado
  const ids = itens.map(i => i.salgado_id)
  const { data: salgados } = await admin.from('salgados').select('id, preco_venda').in('id', ids)
  const precoMap: Record<string, number> = {}
  for (const s of salgados ?? []) precoMap[s.id] = Number(s.preco_venda || 0)

  const { data: pedido, error } = await admin
    .from('salgados_pedidos')
    .insert({
      posto_id: postoId,
      observacao: body.observacao ?? null,
      solicitado_por: auth.user.id,
      status: 'solicitado',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { error: errItens } = await admin.from('salgados_pedido_itens').insert(
    itens.map(i => ({
      pedido_id: pedido.id,
      salgado_id: i.salgado_id,
      quantidade: Number(i.quantidade),
      preco_unitario: precoMap[i.salgado_id] ?? 0,
    })),
  )
  if (errItens) return NextResponse.json({ error: errItens.message }, { status: 500 })

  return NextResponse.json({ pedido })
}
