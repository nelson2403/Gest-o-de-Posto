import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/marketing/patrocinios?status=pendente&posto_id=...&mes=2026-04
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status   = searchParams.get('status')
  const postoId  = searchParams.get('posto_id')
  const mes      = searchParams.get('mes')  // YYYY-MM

  const admin = createAdminClient()

  let query = admin
    .from('marketing_patrocinios')
    .select(`
      *,
      postos ( id, nome ),
      aprovador:usuarios!marketing_patrocinios_aprovado_por_fkey ( id, nome ),
      criador:usuarios!marketing_patrocinios_created_by_fkey ( id, nome ),
      marketing_comprovantes ( id, arquivo_url, arquivo_nome, tipo_arquivo, valor )
    `)
    .order('created_at', { ascending: false })

  if (status)  query = query.eq('status', status)
  if (postoId) query = query.eq('posto_id', postoId)
  if (mes) {
    const [ano, mesNum] = mes.split('-')
    const inicio = `${ano}-${mesNum}-01`
    const ultimoDia = new Date(Number(ano), Number(mesNum), 0).getDate()
    const fim = `${ano}-${mesNum}-${String(ultimoDia).padStart(2, '0')}`
    query = query.gte('data_evento', inicio).lte('data_evento', fim)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ patrocinios: data })
}

// POST /api/marketing/patrocinios
// Body: { posto_id, valor, data_evento, patrocinado, descricao }
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()
  const { posto_id, valor, data_evento, patrocinado, descricao } = body

  if (!posto_id || !valor || !data_evento || !patrocinado) {
    return NextResponse.json({ error: 'Campos obrigatórios: posto_id, valor, data_evento, patrocinado' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Gerente só pode criar para o próprio posto
  const { data: usr } = await admin
    .from('usuarios')
    .select('role, posto_fechamento_id')
    .eq('id', user.id)
    .single()

  if (usr?.role === 'gerente' && usr.posto_fechamento_id !== posto_id) {
    return NextResponse.json({ error: 'Gerente só pode criar solicitações para o próprio posto' }, { status: 403 })
  }

  // Valida limite mensal e anual
  const { data: saldo } = await admin
    .from('vw_marketing_saldo')
    .select('limite_mensal, limite_anual, gasto_mensal_patrocinio, gasto_anual_patrocinio')
    .eq('posto_id', posto_id)
    .single()

  if (saldo) {
    const novoMensal = Number(saldo.gasto_mensal_patrocinio) + Number(valor)
    const novoAnual  = Number(saldo.gasto_anual_patrocinio)  + Number(valor)
    if (novoAnual > Number(saldo.limite_anual)) {
      return NextResponse.json({
        error: `Limite anual excedido. Saldo disponível: R$ ${(Number(saldo.limite_anual) - Number(saldo.gasto_anual_patrocinio)).toFixed(2)}`
      }, { status: 422 })
    }
    if (novoMensal > Number(saldo.limite_mensal)) {
      return NextResponse.json({
        error: `Limite mensal excedido. Saldo disponível: R$ ${(Number(saldo.limite_mensal) - Number(saldo.gasto_mensal_patrocinio)).toFixed(2)}`
      }, { status: 422 })
    }
  }

  const { data, error } = await admin
    .from('marketing_patrocinios')
    .insert({ posto_id, valor, data_evento, patrocinado, descricao, created_by: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log
  await admin.from('marketing_logs').insert({
    tipo: 'patrocinio', ref_id: data.id, acao: 'criado',
    usuario_id: user.id, detalhes: { valor, patrocinado, posto_id }
  })

  return NextResponse.json({ patrocinio: data }, { status: 201 })
}
