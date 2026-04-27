import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buscarPlanoContas } from '@/lib/autosystem'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // Restringe a master (única role com acesso a Máscaras)
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (usuario?.role !== 'master') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  try {
    const contas = await buscarPlanoContas()
    return NextResponse.json({ contas })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao consultar plano de contas'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
