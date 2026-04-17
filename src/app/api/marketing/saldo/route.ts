import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/marketing/saldo
// master/admin/marketing: retorna todos os postos
// gerente/operador: retorna apenas o próprio posto (posto_fechamento_id)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()

  // Busca role e posto do usuário logado
  const { data: usr } = await admin
    .from('usuarios')
    .select('role, posto_fechamento_id')
    .eq('id', user.id)
    .single()

  let query = admin.from('vw_marketing_saldo').select('*').order('posto_nome')

  // Gerente e operador veem apenas o próprio posto
  if (usr && ['gerente', 'operador'].includes(usr.role) && usr.posto_fechamento_id) {
    query = query.eq('posto_id', usr.posto_fechamento_id)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ saldo: data })
}
