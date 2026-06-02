import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — debug: mostra quantas divergências existem
export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: userData } = await supabase
    .from('usuarios')
    .select('role, id, posto_fechamento_id')
    .eq('id', user.id)
    .single()

  const admin = createAdminClient()

  // Total de tarefas de conciliação
  const { data: allTasks } = await admin
    .from('tarefas')
    .select('id, categoria')
    .eq('categoria', 'conciliacao_bancaria')

  // Tarefas com extrato_arquivo_path
  const { data: withFile } = await admin
    .from('tarefas')
    .select('id')
    .eq('categoria', 'conciliacao_bancaria')
    .not('extrato_arquivo_path', 'is', null)

  // Tarefas com extrato_data
  const { data: withData } = await admin
    .from('tarefas')
    .select('id')
    .eq('categoria', 'conciliacao_bancaria')
    .not('extrato_data', 'is', null)

  // Tarefas com extrato_diferenca
  const { data: withDiff } = await admin
    .from('tarefas')
    .select('id, extrato_diferenca, extrato_status, posto_id')
    .eq('categoria', 'conciliacao_bancaria')
    .not('extrato_diferenca', 'is', null)

  // Tarefas com status divergente/ok
  const { data: withStatus } = await admin
    .from('tarefas')
    .select('id, extrato_status, posto_id')
    .eq('categoria', 'conciliacao_bancaria')
    .in('extrato_status', ['divergente', 'ok'])

  // Se conciliador, filtra pelo seu posto
  let userPostoTasks = null
  if (userData?.posto_fechamento_id) {
    const { data } = await admin
      .from('tarefas')
      .select('id, extrato_status, extrato_diferenca, posto_id, titulo')
      .eq('categoria', 'conciliacao_bancaria')
      .eq('posto_id', userData.posto_fechamento_id)
      .in('extrato_status', ['divergente', 'ok'])
      .not('extrato_arquivo_path', 'is', null)
      .not('extrato_data', 'is', null)
      .not('extrato_diferenca', 'is', null)

    userPostoTasks = data
  }

  return NextResponse.json({
    usuario: {
      id: user.id,
      role: userData?.role,
      posto_fechamento_id: userData?.posto_fechamento_id,
    },
    stats: {
      total_conciliacao: allTasks?.length ?? 0,
      com_arquivo: withFile?.length ?? 0,
      com_data: withData?.length ?? 0,
      com_diferenca: withDiff?.length ?? 0,
      com_status_ok_ou_divergente: withStatus?.length ?? 0,
    },
    diferenca_items: withDiff ?? [],
    status_items: withStatus ?? [],
    user_posto_tasks: userPostoTasks ?? [],
  })
}
