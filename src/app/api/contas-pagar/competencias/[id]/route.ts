import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// PATCH — marcar como pago / atualizar
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()
  const admin = createAdminClient()

  const payload: any = {}
  if (body.status !== undefined)          payload.status           = body.status
  if (body.valor_pago !== undefined)      payload.valor_pago       = body.valor_pago ? parseFloat(body.valor_pago) : null
  if (body.data_pagamento !== undefined)  payload.data_pagamento   = body.data_pagamento || null
  if (body.documento !== undefined)       payload.documento        = body.documento || null
  if (body.obs !== undefined)             payload.obs              = body.obs || null
  if (body.movto_mlid !== undefined)       payload.movto_mlid        = body.movto_mlid || null
  if (body.valor_autosystem !== undefined) payload.valor_autosystem  = body.valor_autosystem ? parseFloat(body.valor_autosystem) : null
  if (body.status_as !== undefined)        payload.status_as         = body.status_as || null
  if (body.situacao_as !== undefined)      payload.situacao_as       = body.situacao_as || null
  if (body.conferido !== undefined) {
    payload.conferido    = body.conferido
    payload.conferido_em = body.conferido ? new Date().toISOString() : null
    payload.conferido_por = body.conferido ? user.id : null
  }

  if (body.status === 'pago') {
    payload.pago_por = user.id
    payload.pago_em  = new Date().toISOString()
  }

  const { data, error } = await admin
    .from('cp_competencias')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ competencia: data })
}
