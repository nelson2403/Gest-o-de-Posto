import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/debug-zero-as
// Mostra por que tarefas com extrato processado têm extrato_saldo_externo = 0
export async function GET() {
  const admin = createAdminClient()

  // Tarefas com extrato processado e AS = 0 mas extrato != 0
  const { data: tarefas } = await admin
    .from('tarefas')
    .select(`
      id, titulo, extrato_data, extrato_movimento, extrato_saldo_externo,
      extrato_diferenca, extrato_status, posto_id, tarefa_recorrente_id,
      posto:postos(id, nome, codigo_empresa_externo)
    `)
    .in('extrato_status', ['ok', 'divergente'])
    .not('extrato_data', 'is', null)
    .not('extrato_movimento', 'is', null)
    .eq('extrato_saldo_externo', 0)

  const { data: recorrentes } = await admin
    .from('tarefas_recorrentes')
    .select('id, posto_id, posto:postos(id, nome, codigo_empresa_externo)')

  const recMap: Record<string, any> = {}
  for (const r of recorrentes ?? []) {
    if (r.id) recMap[r.id] = r
  }

  const { data: contas } = await admin
    .from('contas_bancarias')
    .select('posto_id, banco, conta, codigo_conta_externo')

  const contaMap: Record<string, any[]> = {}
  for (const c of contas ?? []) {
    if (!c.posto_id) continue
    if (!contaMap[c.posto_id]) contaMap[c.posto_id] = []
    contaMap[c.posto_id].push(c)
  }

  const resultado = []

  for (const t of tarefas ?? []) {
    type PostoInfo = { id: string; nome: string; codigo_empresa_externo: string | null }
    const posto = (t.posto as unknown as PostoInfo | null)
    const rec = t.tarefa_recorrente_id ? recMap[t.tarefa_recorrente_id] : null
    const postoFinal: PostoInfo | null = posto ?? (rec?.posto as PostoInfo | null) ?? null
    const postoId = (t.posto_id as string | null) ?? rec?.posto_id ?? postoFinal?.id ?? null

    if (!postoFinal?.codigo_empresa_externo || !postoId) {
      resultado.push({
        tarefa_id: t.id,
        titulo: t.titulo,
        data: t.extrato_data,
        movimento_extrato: t.extrato_movimento,
        diagnostico: '❌ posto sem codigo_empresa_externo',
      })
      continue
    }

    const empresaId = parseInt(postoFinal.codigo_empresa_externo)
    const contasPosto = contaMap[postoId] ?? []
    const contaCodigo: string | null = contasPosto.find((c: any) => c.codigo_conta_externo)?.codigo_conta_externo ?? null

    // Conta total de registros para essa empresa/data
    const { count: totalRegistros } = await admin
      .from('as_movto')
      .select('*', { count: 'exact', head: true })
      .eq('empresa', empresaId)
      .eq('data', t.extrato_data as string)

    // Conta registros que batem com a conta mapeada
    let registrosComConta = 0
    let debitoComConta = 0
    let creditoComConta = 0
    if (contaCodigo && (totalRegistros ?? 0) > 0) {
      const { data: movsDia } = await admin
        .from('as_movto')
        .select('conta_debitar, conta_creditar, valor')
        .eq('empresa', empresaId)
        .eq('data', t.extrato_data as string)
        .limit(5000)

      registrosComConta = (movsDia ?? []).filter(
        m => (m as any).conta_debitar === contaCodigo || (m as any).conta_creditar === contaCodigo
      ).length
      debitoComConta = (movsDia ?? [])
        .filter(m => (m as any).conta_debitar === contaCodigo)
        .reduce((s, m) => s + ((m as any).valor ?? 0), 0)
      creditoComConta = (movsDia ?? [])
        .filter(m => (m as any).conta_creditar === contaCodigo)
        .reduce((s, m) => s + ((m as any).valor ?? 0), 0)
    }

    let diagnostico = ''
    if ((totalRegistros ?? 0) === 0) {
      diagnostico = '❌ NENHUM registro no mirror para essa empresa/data — dados não sincronizados'
    } else if (!contaCodigo) {
      diagnostico = '❌ conta bancária sem codigo_conta_externo'
    } else if (registrosComConta === 0) {
      diagnostico = `❌ conta ${contaCodigo} não encontrada em nenhum registro da data (${totalRegistros} registros existem mas nenhum usa essa conta)`
    } else {
      diagnostico = `⚠️ conta ${contaCodigo} tem ${registrosComConta} registros mas débito=${debitoComConta.toFixed(2)} credito=${creditoComConta.toFixed(2)} → movimento=${(debitoComConta - creditoComConta).toFixed(2)}`
    }

    resultado.push({
      posto: postoFinal.nome,
      tarefa_id: t.id,
      data: t.extrato_data,
      movimento_extrato: t.extrato_movimento,
      empresa_grid: empresaId,
      conta_mapeada: contaCodigo ?? '(nenhuma)',
      total_registros_mirror: totalRegistros ?? 0,
      registros_conta_mapeada: registrosComConta,
      diagnostico,
    })
  }

  const porDiagnostico: Record<string, number> = {}
  for (const r of resultado) {
    const key = (r as any).diagnostico?.split(' ').slice(0, 3).join(' ') ?? 'outro'
    porDiagnostico[key] = (porDiagnostico[key] ?? 0) + 1
  }

  return NextResponse.json({
    total_tarefas_com_zero_as: resultado.length,
    resumo_diagnosticos: porDiagnostico,
    detalhes: resultado,
  })
}
