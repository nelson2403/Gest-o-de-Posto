import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPostosGerente } from '@/lib/postos-gerente'

export const PRODUTOS_COMBUSTIVEL = [
  'Gasolina Comum', 'Gasolina Aditivada', 'Etanol', 'Diesel Comum', 'Diesel S-10', 'GNV',
]

// Resolve os postos que o usuário pode lançar preço (gerente: os seus; master: todos)
async function postosPermitidos() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado', status: 401 as const }

  const { data: u } = await supabase
    .from('usuarios').select('role, posto_fechamento_id').eq('id', user.id).single()
  if (!u || !['gerente', 'master'].includes(u.role ?? '')) {
    return { erro: 'Sem permissão', status: 403 as const }
  }

  const admin = createAdminClient()
  let postos: { id: string; nome: string }[] = []
  if (u.role === 'master') {
    const { data } = await admin.from('postos').select('id, nome').eq('ativo', true).order('nome')
    postos = data ?? []
  } else {
    const ids = await getPostosGerente(admin, user.id, u.posto_fechamento_id)
    if (ids.length) {
      const { data } = await admin.from('postos').select('id, nome').in('id', ids).order('nome')
      postos = data ?? []
    }
  }
  return { user, admin, postos, role: u.role as string }
}

// GET — postos do gerente + preços atuais de combustível
export async function GET() {
  const ctx = await postosPermitidos()
  if ('erro' in ctx) return NextResponse.json({ error: ctx.erro }, { status: ctx.status })

  const postoIds = ctx.postos.map(p => p.id)
  const { data: precos } = postoIds.length
    ? await ctx.admin.from('precos_combustivel').select('posto_id, produto, preco, atualizado_em').in('posto_id', postoIds)
    : { data: [] }

  return NextResponse.json({ postos: ctx.postos, precos: precos ?? [], produtos: PRODUTOS_COMBUSTIVEL })
}

// POST — lança/atualiza o preço de um combustível do posto (vira pendência nos portais)
export async function POST(req: NextRequest) {
  const ctx = await postosPermitidos()
  if ('erro' in ctx) return NextResponse.json({ error: ctx.erro }, { status: ctx.status })

  const { posto_id, produto, preco } = await req.json() as { posto_id?: string; produto?: string; preco?: number }
  if (!posto_id || !produto || preco == null) {
    return NextResponse.json({ error: 'Informe posto, combustível e preço' }, { status: 400 })
  }
  if (!ctx.postos.some(p => p.id === posto_id)) {
    return NextResponse.json({ error: 'Você não pode lançar preço para este posto' }, { status: 403 })
  }
  if (!PRODUTOS_COMBUSTIVEL.includes(produto)) {
    return NextResponse.json({ error: 'Combustível inválido' }, { status: 400 })
  }
  const valor = Number(preco)
  if (isNaN(valor) || valor <= 0) {
    return NextResponse.json({ error: 'Preço inválido' }, { status: 400 })
  }

  const { data, error } = await ctx.admin
    .from('precos_combustivel')
    .upsert(
      { posto_id, produto, preco: valor, atualizado_em: new Date().toISOString(), atualizado_por: ctx.user.id },
      { onConflict: 'posto_id,produto' },
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ preco: data })
}
