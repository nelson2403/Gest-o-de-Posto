import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/marketing/acoes?status=aberta
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const admin = createAdminClient()

  let query = admin
    .from('marketing_acoes')
    .select(`
      *,
      criador:usuarios!marketing_acoes_criado_por_fkey ( id, nome ),
      marketing_acao_postos (
        id, posto_id, valor, status, aprovado_em,
        postos ( id, nome ),
        marketing_comprovantes ( id, arquivo_url, arquivo_nome, valor )
      )
    `)
    .order('data_acao', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ acoes: data })
}

// POST /api/marketing/acoes
// Body: { titulo, descricao, valor_padrao, data_acao, prazo_envio, postos: string[] }
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()

  // Verifica role
  const { data: usr } = await admin.from('usuarios').select('role').eq('id', user.id).single()
  if (!usr || !['master', 'admin', 'marketing'].includes(usr.role)) {
    return NextResponse.json({ error: 'Sem permissão para criar ações' }, { status: 403 })
  }

  const { titulo, descricao, valor_padrao, data_acao, prazo_envio, postos } = await req.json()

  if (!titulo || !data_acao || !prazo_envio || !postos?.length) {
    return NextResponse.json({ error: 'Campos obrigatórios: titulo, data_acao, prazo_envio, postos' }, { status: 400 })
  }

  const { data: acao, error } = await admin
    .from('marketing_acoes')
    .insert({ titulo, descricao, valor_padrao: valor_padrao ?? 150, data_acao, prazo_envio, criado_por: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Cria registros para cada posto participante
  const acaoPostos = (postos as string[]).map((posto_id: string) => ({
    acao_id: acao.id,
    posto_id,
  }))

  const { error: apError } = await admin.from('marketing_acao_postos').insert(acaoPostos)
  if (apError) return NextResponse.json({ error: apError.message }, { status: 500 })

  await admin.from('marketing_logs').insert({
    tipo: 'acao', ref_id: acao.id, acao: 'criado',
    usuario_id: user.id, detalhes: { titulo, postos_count: postos.length }
  })

  return NextResponse.json({ acao }, { status: 201 })
}
