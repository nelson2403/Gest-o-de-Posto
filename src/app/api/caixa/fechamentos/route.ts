import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/caixa/fechamentos?posto_id=...&data_ini=...&data_fim=...
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { data: usuario } = await supabase
      .from('usuarios')
      .select('role, posto_fechamento_id')
      .eq('id', user.id)
      .single()

    if (!usuario) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    const roles = ['master', 'adm_financeiro', 'gerente', 'operador_caixa']
    if (!roles.includes(usuario.role ?? '')) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const posto_id = searchParams.get('posto_id')
    const data_ini = searchParams.get('data_ini')
    const data_fim = searchParams.get('data_fim')

    const admin = createAdminClient()
    let query = admin
      .from('frentista_fechamentos')
      .select('*, postos(nome)')
      .order('criado_em', { ascending: false })
      .limit(200)

    if (usuario.role === 'gerente' && usuario.posto_fechamento_id) {
      query = query.eq('posto_id', usuario.posto_fechamento_id)
    } else if (posto_id) {
      query = query.eq('posto_id', posto_id)
    }

    if (data_ini) query = query.gte('data_fechamento', data_ini)
    if (data_fim) query = query.lte('data_fechamento', data_fim)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
