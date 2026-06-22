import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/tarefas/[id]/reabrir
// Reabre uma tarefa de conciliação bancária (concluída/divergente) para que o
// conciliador possa anexar o extrato correto. Volta o status para "pendente" e
// limpa o status do extrato.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: userData } = await supabase
    .from('usuarios')
    .select('role')
    .eq('id', user.id)
    .single()

  if (userData?.role !== 'master') {
    return NextResponse.json({ error: 'Apenas o master pode reabrir tarefas' }, { status: 403 })
  }

  const admin = createAdminClient()

  const { data: tarefa } = await admin
    .from('tarefas')
    .select('id, categoria')
    .eq('id', id)
    .single()

  if (!tarefa) return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })
  if (tarefa.categoria !== 'conciliacao_bancaria') {
    return NextResponse.json({ error: 'Apenas tarefas de conciliação bancária podem ser reabertas por aqui' }, { status: 400 })
  }

  // Volta para pendente e LIMPA os dados do extrato. Limpar extrato_diferenca é o
  // que faz a tarefa sair da lista de divergências (a query filtra por esse campo).
  // O campo updated_at é mantido pelo trigger da tabela.
  const { data, error } = await admin
    .from('tarefas')
    .update({
      status:                 'pendente',
      data_conclusao_real:    null,
      extrato_status:         null,
      extrato_diferenca:      null,
      extrato_movimento:      null,
      extrato_saldo_externo:  null,
      extrato_saldo_dia:      null,
      extrato_saldo_anterior: null,
      extrato_data:           null,
      extrato_arquivo_path:   null,
      extrato_arquivo_nome:   null,
      extrato_validado_em:    null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tarefa: data })
}
