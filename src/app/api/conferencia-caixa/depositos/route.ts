import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/conferencia-caixa/depositos?posto_id=&data_ini=&data_fim=&tipo=&status=
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const posto_id = searchParams.get('posto_id')
  const data_ini = searchParams.get('data_ini')
  const data_fim = searchParams.get('data_fim')
  const tipo     = searchParams.get('tipo')
  const status   = searchParams.get('status')

  const admin = createAdminClient()
  let q = admin
    .from('caixa_depositos')
    .select('*, posto:postos(id, nome)')
    .order('data_deposito', { ascending: false })
    .order('tipo')

  if (posto_id && posto_id !== 'todos') q = q.eq('posto_id', posto_id)
  if (data_ini) q = q.gte('data_deposito', data_ini)
  if (data_fim) q = q.lte('data_deposito', data_fim)
  if (tipo   && tipo   !== 'todos') q = q.eq('tipo',   tipo)
  if (status && status !== 'todos') q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ depositos: data ?? [] })
}
