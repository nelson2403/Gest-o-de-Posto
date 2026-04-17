import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/auto-configurar-contas
// 1. Para cada posto sem codigo_conta_externo, descobre a conta bancária pelo as_movto
// 2. Auto-aplica quando há exatamente 1 conta 1.2.* encontrada
// 3. Recalcula extrato_saldo_externo para todas as tarefas divergentes/ok do posto
// 4. Retorna relatório do que foi feito e o que precisa de revisão manual
export async function GET() {
  const admin = createAdminClient()

  // Busca todos os postos com empresa configurada
  const { data: postos } = await admin
    .from('postos')
    .select('id, nome, codigo_empresa_externo')
    .not('codigo_empresa_externo', 'is', null)
    .order('nome')

  // Busca contas bancárias
  const { data: todasContas } = await admin
    .from('contas_bancarias')
    .select('id, posto_id, banco, conta, codigo_conta_externo')

  const contaMap: Record<string, any[]> = {}
  for (const c of todasContas ?? []) {
    if (!c.posto_id) continue
    if (!contaMap[c.posto_id]) contaMap[c.posto_id] = []
    contaMap[c.posto_id].push(c)
  }

  // Busca tarefas com extrato processado
  const { data: tarefas } = await admin
    .from('tarefas')
    .select('id, posto_id, tarefa_recorrente_id, extrato_data, extrato_movimento, extrato_status')
    .in('extrato_status', ['ok', 'divergente'])
    .not('extrato_data', 'is', null)
    .not('extrato_movimento', 'is', null)

  const { data: recorrentes } = await admin
    .from('tarefas_recorrentes')
    .select('id, posto_id')

  const recMap: Record<string, string> = {}
  for (const r of recorrentes ?? []) {
    if (r.id && r.posto_id) recMap[r.id] = r.posto_id
  }

  const aplicados: any[] = []
  const multiplos: any[] = []
  const semDados: any[] = []
  const jaConfigurados: string[] = []

  for (const p of postos ?? []) {
    const contasPosto = contaMap[p.id] ?? []
    const semCodigo = contasPosto.filter((c: any) => !c.codigo_conta_externo)

    if (semCodigo.length === 0) {
      jaConfigurados.push(p.nome)
      continue
    }

    const empresaId = parseInt(p.codigo_empresa_externo!)

    // Busca contas 1.2.* distintas dos últimos 60 dias
    const dataIni = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)
    const { data: movtos } = await admin
      .from('as_movto')
      .select('conta_debitar, conta_creditar, valor')
      .eq('empresa', empresaId)
      .gte('data', dataIni)
      .limit(5000)

    if (!movtos || movtos.length === 0) {
      semDados.push({ posto: p.nome, posto_id: p.id, empresa_grid: empresaId })
      continue
    }

    // Soma por conta 1.2.*
    const totais: Record<string, { debito: number; credito: number; n: number }> = {}
    for (const m of movtos) {
      for (const side of ['conta_debitar', 'conta_creditar'] as const) {
        const c = (m as any)[side]
        if (c?.startsWith('1.2.')) {
          if (!totais[c]) totais[c] = { debito: 0, credito: 0, n: 0 }
          if (side === 'conta_debitar') totais[c].debito += (m as any).valor ?? 0
          else totais[c].credito += (m as any).valor ?? 0
          totais[c].n++
        }
      }
    }

    const contas12 = Object.entries(totais)
      .map(([conta, t]) => ({ conta, movimento: parseFloat((t.debito - t.credito).toFixed(2)), n: t.n }))
      .sort((a, b) => b.n - a.n)

    if (contas12.length === 0) {
      semDados.push({ posto: p.nome, posto_id: p.id, empresa_grid: empresaId, motivo: 'nenhuma conta 1.2.* encontrada' })
      continue
    }

    if (contas12.length === 1 && semCodigo.length === 1) {
      // Auto-aplica
      const codigoConta = contas12[0].conta
      await admin
        .from('contas_bancarias')
        .update({ codigo_conta_externo: codigoConta })
        .eq('id', semCodigo[0].id)

      // Recalcula tarefas deste posto
      const tarefasPosto = (tarefas ?? []).filter(t => {
        const pid = (t.posto_id as string | null) ?? (t.tarefa_recorrente_id ? recMap[t.tarefa_recorrente_id] : null)
        return pid === p.id
      })

      let recalculadas = 0
      for (const tar of tarefasPosto) {
        const data = tar.extrato_data as string
        const { data: movsDia } = await admin
          .from('as_movto')
          .select('conta_debitar, conta_creditar, valor')
          .eq('empresa', empresaId)
          .eq('data', data)
          .limit(5000)

        const deb = (movsDia ?? []).filter(m => (m as any).conta_debitar === codigoConta).reduce((s, m) => s + ((m as any).valor ?? 0), 0)
        const cre = (movsDia ?? []).filter(m => (m as any).conta_creditar === codigoConta).reduce((s, m) => s + ((m as any).valor ?? 0), 0)
        const movAS = parseFloat((deb - cre).toFixed(2))
        const movExtrato = tar.extrato_movimento as number
        const diferenca = parseFloat((movExtrato - movAS).toFixed(2))
        const status = Math.abs(diferenca) < 0.02 ? 'ok' : 'divergente'

        const updates: any = {
          extrato_saldo_externo: movAS,
          extrato_diferenca: diferenca,
          extrato_status: status,
        }
        if (status === 'ok' && tar.extrato_status === 'divergente') {
          updates.status = 'concluido'
          updates.data_conclusao_real = new Date().toISOString()
        }

        await admin.from('tarefas').update(updates).eq('id', tar.id)
        recalculadas++
      }

      aplicados.push({
        posto: p.nome,
        conta_banco: semCodigo[0].conta,
        codigo_aplicado: codigoConta,
        tarefas_recalculadas: recalculadas,
      })
    } else {
      multiplos.push({
        posto: p.nome,
        posto_id: p.id,
        empresa_grid: empresaId,
        contas_sem_codigo: semCodigo.map((c: any) => ({ id: c.id, banco: c.banco, conta: c.conta })),
        contas_1_2_encontradas: contas12,
      })
    }
  }

  return NextResponse.json({
    ok: true,
    resumo: {
      aplicados_automaticamente: aplicados.length,
      multiplas_contas_revisao_manual: multiplos.length,
      sem_dados_no_mirror: semDados.length,
      ja_configurados: jaConfigurados.length,
    },
    aplicados,
    precisam_revisao_manual: multiplos,
    sem_dados_no_mirror: semDados,
  })
}
