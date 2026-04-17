import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// PATCH /api/conferencia-caixa/depositos/[id]  — ajuste manual
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()
  const admin = createAdminClient()

  const payload: Record<string, unknown> = {
    ajuste_manual: true,
    ajustado_por:  user.id,
    ajustado_em:   new Date().toISOString(),
  }

  if ('status'        in body) payload.status        = body.status
  if ('valor_extrato' in body) payload.valor_extrato = body.valor_extrato != null ? parseFloat(body.valor_extrato) : null
  if ('data_extrato'  in body) payload.data_extrato  = body.data_extrato || null
  if ('ajuste_obs'    in body) payload.ajuste_obs    = body.ajuste_obs   || null

  const { data, error } = await admin
    .from('caixa_depositos')
    .update(payload)
    .eq('id', id)
    .select('*, posto:postos(id, nome)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deposito: data })
}
