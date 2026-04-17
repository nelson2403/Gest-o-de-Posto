import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/extrato-verificar/aceitar
// Body: { ids: string[] }  — IDs das tarefas divergentes a aceitar como corretas
// Marca extrato_status = 'ok' e atualiza extrato_saldo_externo com o valor atual do AS
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()
  const ids: string[] = body.ids ?? []
  if (!ids.length) return NextResponse.json({ aceitas: 0 })

  const admin = createAdminClient()

  // Para cada tarefa divergente, aceitar: status = ok, diferenca = 0,
  // e saldo_externo = movAtual (que está em extrato_saldo_externo depois da última verificação)
  const { error } = await admin
    .from('tarefas')
    .update({
      extrato_status:    'ok',
      extrato_diferenca: 0,
    })
    .in('id', ids)
    .eq('extrato_status', 'divergente')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ aceitas: ids.length })
}
