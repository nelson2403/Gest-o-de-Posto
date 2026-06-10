import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ROLES = ['master', 'adm_financeiro', 'gerente']

async function autorizar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado', status: 401 as const }
  const { data: u } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
  if (!u || !ROLES.includes(u.role)) return { erro: 'Sem permissão', status: 403 as const }
  return { user }
}

// GET — produções recentes
export async function GET() {
  const auth = await autorizar()
  if ('erro' in auth) return NextResponse.json({ error: auth.erro }, { status: auth.status })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('salgados_producao')
    .select('id, quantidade, custo_total, data, observacao, salgado:salgados(id, nome, unidade)')
    .order('data', { ascending: false })
    .order('criado_em', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ producoes: data ?? [] })
}

// POST — registra produção: dá baixa nos insumos (ficha) e soma ao estoque do salgado
export async function POST(req: NextRequest) {
  const auth = await autorizar()
  if ('erro' in auth) return NextResponse.json({ error: auth.erro }, { status: auth.status })

  const body = await req.json() as { salgado_id: string; quantidade: number; data?: string; observacao?: string }
  const qtd = Number(body.quantidade)
  if (!body.salgado_id || !qtd || qtd <= 0) {
    return NextResponse.json({ error: 'Salgado e quantidade são obrigatórios' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: salgado } = await admin.from('salgados').select('id, custo, estoque').eq('id', body.salgado_id).single()
  if (!salgado) return NextResponse.json({ error: 'Salgado não encontrado' }, { status: 404 })

  // Ficha técnica → baixa insumos
  const { data: ficha } = await admin
    .from('salgados_ficha')
    .select('insumo_id, quantidade, insumo:salgados_insumos(id, estoque, custo_unitario)')
    .eq('salgado_id', body.salgado_id)

  let custoUnit = 0
  for (const f of (ficha ?? []) as any[]) {
    const consumo = qtd * Number(f.quantidade || 0)
    custoUnit += Number(f.quantidade || 0) * Number(f.insumo?.custo_unitario || 0)
    const novoEstoque = Number(f.insumo?.estoque || 0) - consumo
    await admin.from('salgados_insumos').update({ estoque: novoEstoque }).eq('id', f.insumo_id)
  }

  const custoTotal = parseFloat((custoUnit * qtd).toFixed(2))

  // Registra produção
  const { data: prod, error } = await admin
    .from('salgados_producao')
    .insert({
      salgado_id: body.salgado_id,
      quantidade: qtd,
      custo_total: custoTotal,
      data: body.data || new Date().toISOString().slice(0, 10),
      observacao: body.observacao ?? null,
      criado_por: auth.user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Soma ao estoque do salgado + movimentação
  await admin.from('salgados').update({ estoque: Number(salgado.estoque || 0) + qtd }).eq('id', body.salgado_id)
  await admin.from('salgados_estoque_mov').insert({
    salgado_id: body.salgado_id, tipo: 'producao', quantidade: qtd, ref_id: prod.id, criado_por: auth.user.id,
  })

  return NextResponse.json({ producao: prod, custo_total: custoTotal })
}
