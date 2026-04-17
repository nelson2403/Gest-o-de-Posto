import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/extrato-verificar
// Re-consulta o mirror (as_movto) para todas as tarefas com extrato_status = 'ok'
// e marca como 'divergente' se o valor mudou desde a validação original.
export async function POST(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()

  // Busca todas as tarefas com extrato ok ou divergente
  const { data: tarefas, error } = await admin
    .from('tarefas')
    .select(`
      id, titulo, extrato_data, extrato_movimento, extrato_saldo_externo,
      extrato_diferenca, extrato_status, posto_id, tarefa_recorrente_id,
      posto:postos(id, nome, codigo_empresa_externo),
      recorrente:tarefas_recorrentes(posto_id, posto:postos(id, nome, codigo_empresa_externo))
    `)
    .in('extrato_status', ['ok', 'divergente'])
    .not('extrato_data', 'is', null)
    .not('extrato_movimento', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!tarefas || tarefas.length === 0) return NextResponse.json({ verificadas: 0, divergentes: [] })

  // Busca mapa de contas bancárias por posto
  const { data: contas } = await admin
    .from('contas_bancarias')
    .select('posto_id, codigo_conta_externo')
    .not('codigo_conta_externo', 'is', null)

  const contaMap: Record<string, string> = {}
  for (const c of contas ?? []) {
    if (c.posto_id) contaMap[c.posto_id] = c.codigo_conta_externo!
  }

  const divergentes: {
    id: string; titulo: string; postoNome: string; data: string
    movExtrato: number; movAnterior: number; movAtual: number; diferenca: number
  }[] = []
  let resolvidos = 0

  for (const t of tarefas) {
    type PostoInfo = { id: string; nome: string; codigo_empresa_externo: string | null }
    const recorrente = t.recorrente as unknown as { posto_id: string | null; posto: PostoInfo | null } | null
    const posto = (t.posto as unknown as PostoInfo | null) ?? recorrente?.posto ?? null
    const postoId = (t.posto_id as string | null) ?? recorrente?.posto_id ?? posto?.id ?? null

    if (!posto?.codigo_empresa_externo) continue

    const empresaId   = parseInt(posto.codigo_empresa_externo)
    const contaCodigo = postoId ? (contaMap[postoId] ?? null) : null
    const extratoData = t.extrato_data as string
    const movExtrato  = t.extrato_movimento as number
    const movAnterior = t.extrato_saldo_externo as number

    let movAtual = 0

    try {
      // Busca movimentos do dia para a empresa
      const { data: movtos } = await admin
        .from('as_movto')
        .select('conta_debitar, conta_creditar, valor')
        .eq('empresa', empresaId)
        .eq('data', extratoData)

      if (contaCodigo) {
        // Conta bancária específica
        const debito  = (movtos ?? []).filter(m => m.conta_debitar  === contaCodigo).reduce((s, m) => s + (m.valor ?? 0), 0)
        const credito = (movtos ?? []).filter(m => m.conta_creditar === contaCodigo).reduce((s, m) => s + (m.valor ?? 0), 0)
        movAtual = parseFloat((debito - credito).toFixed(2))
      } else {
        // Fallback: conta 1.2.* excluindo transferências internas entre contas bancárias
        const debito  = (movtos ?? []).filter(m => m.conta_debitar?.startsWith('1.2.')  && !m.conta_creditar?.startsWith('1.2.')).reduce((s, m) => s + (m.valor ?? 0), 0)
        const credito = (movtos ?? []).filter(m => m.conta_creditar?.startsWith('1.2.') && !m.conta_debitar?.startsWith('1.2.')).reduce((s, m) => s + (m.valor ?? 0), 0)
        movAtual = parseFloat((debito - credito).toFixed(2))
      }
    } catch {
      continue
    }

    const diferenca   = parseFloat((movExtrato - movAtual).toFixed(2))
    const estaOk      = Math.abs(diferenca) < 0.02
    const statusAtual = t.extrato_status as 'ok' | 'divergente'

    if (statusAtual === 'ok') {
      const mudou = Math.abs(movAtual - movAnterior) >= 0.02
      if (mudou) {
        await admin
          .from('tarefas')
          .update({
            extrato_status:        'divergente',
            extrato_saldo_externo: movAtual,
            extrato_diferenca:     diferenca,
          })
          .eq('id', t.id)

        divergentes.push({
          id:        t.id,
          titulo:    t.titulo,
          postoNome: posto.nome,
          data:      extratoData,
          movExtrato,
          movAnterior,
          movAtual,
          diferenca,
        })
      }
    } else {
      if (estaOk) {
        await admin
          .from('tarefas')
          .update({
            extrato_status:        'ok',
            extrato_saldo_externo: movAtual,
            extrato_diferenca:     0,
          })
          .eq('id', t.id)
        resolvidos++
      } else {
        await admin
          .from('tarefas')
          .update({
            extrato_saldo_externo: movAtual,
            extrato_diferenca:     diferenca,
          })
          .eq('id', t.id)

        divergentes.push({
          id:        t.id,
          titulo:    t.titulo,
          postoNome: posto.nome,
          data:      extratoData,
          movExtrato,
          movAnterior,
          movAtual,
          diferenca,
        })
      }
    }
  }

  return NextResponse.json({
    verificadas: tarefas.length,
    divergentes,
    resolvidos,
  })
}
