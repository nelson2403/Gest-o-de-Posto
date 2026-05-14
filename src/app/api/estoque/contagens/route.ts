import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const limit = Number(searchParams.get('limit') ?? '20')

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('contagens_estoque')
    .select('id, posto_nome, grupo_nome, data_contagem, criado_em, codigo_empresa_externo, grupo_id')
    .order('criado_em', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contagens: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { empresa_id, codigo_empresa_externo, posto_nome, grupo_id, grupo_nome, data_contagem, itens } = body

  if (!empresa_id || !posto_nome || !grupo_id || !itens?.length) {
    return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: contagem, error: errContagem } = await admin
    .from('contagens_estoque')
    .insert({
      empresa_id,
      codigo_empresa_externo,
      posto_nome,
      grupo_id: String(grupo_id),
      grupo_nome,
      data_contagem,
      usuario_id: user.id,
    })
    .select('id')
    .single()

  if (errContagem || !contagem) {
    return NextResponse.json({ error: errContagem?.message ?? 'Erro ao salvar' }, { status: 500 })
  }

  const itensSalvar = itens.map((it: any) => ({
    contagem_id:  contagem.id,
    produto_id:   it.produto_id,
    produto_nome: it.produto_nome,
    unid_med:     it.unid_med,
    qtd_sistema:  it.qtd_sistema,
    custo_medio:  it.custo_medio,
    qtd_contada:  it.qtd_contada ?? null,
  }))

  const { error: errItens } = await admin
    .from('contagens_estoque_itens')
    .insert(itensSalvar)

  if (errItens) return NextResponse.json({ error: errItens.message }, { status: 500 })

  return NextResponse.json({ id: contagem.id })
}
