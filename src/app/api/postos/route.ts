import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // Busca role do usuário para filtrar postos
  const { data: usuarioData } = await supabase
    .from('usuarios')
    .select('role, empresa_id')
    .eq('id', user.id)
    .single()

  const admin = createAdminClient()
  let query = admin.from('postos').select('id, nome').order('nome')

  // Master vê todos; demais usuários veem só da sua empresa
  if (usuarioData?.role !== 'master' && usuarioData?.empresa_id) {
    query = query.eq('empresa_id', usuarioData.empresa_id)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ postos: data ?? [] })
}
