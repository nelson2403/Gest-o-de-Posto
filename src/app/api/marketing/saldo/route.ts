import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPostosGerente } from '@/lib/postos-gerente'

// GET /api/marketing/saldo
// master/admin/marketing: retorna todos os postos
// gerente: retorna apenas os postos vinculados ao gerente (multi-posto)
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

  // Gerente vê todos os postos vinculados a ele (junção; fallback ao posto único)
  if (usr && usr.role === 'gerente') {
    const ids = await getPostosGerente(admin, user.id, usr.posto_fechamento_id)
    query = query.in('posto_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ saldo: data })
}
