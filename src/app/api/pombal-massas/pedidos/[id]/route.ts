import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Só POMBAL (master/adm) altera status; gerente apenas cancela o próprio
const ROLES = ['master', 'adm_financeiro', 'gerente']
const STATUS = ['solicitado', 'aprovado', 'em_producao', 'entregue', 'cancelado']

async function autorizar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado', status: 401 as const }
  const { data: u } = await supabase.from('usuarios').select('role, posto_fechamento_id').eq('id', user.id).single()
  if (!u || !ROLES.includes(u.role)) return { erro: 'Sem permissão', status: 403 as const }
  return { user, role: u.role, postoId: u.posto_fechamento_id as string | null }
}

// PUT — muda status do pedido. Ao "entregue", dá baixa no estoque dos salgados.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autorizar()
  if ('erro' in auth) return NextResponse.json({ error: auth.erro }, { status: auth.status })

  const { id } = await params
  const body = await req.json() as { status?: string; observacao?: string }
  const admin = createAdminClient()

  const { data: pedido } = await admin
    .from('salgados_pedidos')
    .select('id, status, posto_id')
    .eq('id', id)
    .single()
  if (!pedido) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })

  // Gerente só pode cancelar o próprio pedido
  if (auth.role === 'gerente') {
    if (pedido.posto_id !== auth.postoId) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    if (body.status && body.status !== 'cancelado') return NextResponse.json({ error: 'Gerente só pode cancelar' }, { status: 403 })
  }

  const novoStatus = body.status
  if (novoStatus && !STATUS.includes(novoStatus)) {
    return NextResponse.json({ error: 'Status inválido' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (novoStatus) update.status = novoStatus
  if (body.observacao !== undefined) update.observacao = body.observacao

  // Ao marcar como entregue: baixa estoque dos salgados (uma vez só)
  if (novoStatus === 'entregue' && pedido.status !== 'entregue') {
    update.data_entrega = new Date().toISOString()
    const { data: itens } = await admin
      .from('salgados_pedido_itens')
      .select('salgado_id, quantidade')
      .eq('pedido_id', id)

    for (const it of itens ?? []) {
      const { data: s } = await admin.from('salgados').select('estoque').eq('id', it.salgado_id).single()
      const novo = Number(s?.estoque || 0) - Number(it.quantidade || 0)
      await admin.from('salgados').update({ estoque: novo }).eq('id', it.salgado_id)
      await admin.from('salgados_estoque_mov').insert({
        salgado_id: it.salgado_id, tipo: 'pedido', quantidade: -Number(it.quantidade || 0),
        ref_id: id, criado_por: auth.user.id,
      })
    }
  }

  const { data, error } = await admin.from('salgados_pedidos').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pedido: data })
}
