import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/debug-postos-extrato
// Lista todos os postos com status do extrato e configuração de conta externa
export async function GET() {
  const admin = createAdminClient()

  const { data: postos } = await admin
    .from('postos')
    .select('id, nome, codigo_empresa_externo')
    .order('nome')

  const { data: contas } = await admin
    .from('contas_bancarias')
    .select('posto_id, banco, conta, codigo_conta_externo')

  const { data: tarefas } = await admin
    .from('tarefas')
    .select('posto_id, extrato_status, extrato_saldo_externo, extrato_movimento, extrato_diferenca, extrato_data, tarefa_recorrente_id')
    .in('extrato_status', ['ok', 'divergente'])
    .not('extrato_data', 'is', null)
    .order('extrato_data', { ascending: false })

  const { data: recorrentes } = await admin
    .from('tarefas_recorrentes')
    .select('id, posto_id')

  const recMap: Record<string, string> = {}
  for (const r of recorrentes ?? []) {
    if (r.id && r.posto_id) recMap[r.id] = r.posto_id
  }

  const contaMap: Record<string, any[]> = {}
  for (const c of contas ?? []) {
    if (!c.posto_id) continue
    if (!contaMap[c.posto_id]) contaMap[c.posto_id] = []
    contaMap[c.posto_id].push(c)
  }

  const resultado = (postos ?? []).map(p => {
    const contasPosto = contaMap[p.id] ?? []
    const temCodigoExterno = contasPosto.some(c => c.codigo_conta_externo)

    // Tarefas deste posto (diretas ou via recorrente)
    const tarefasPosto = (tarefas ?? []).filter(t => {
      const postoIdDireto = t.posto_id
      const postoIdRec   = t.tarefa_recorrente_id ? recMap[t.tarefa_recorrente_id] : null
      return postoIdDireto === p.id || postoIdRec === p.id
    })

    const comZero     = tarefasPosto.filter(t => (t.extrato_saldo_externo ?? 0) === 0 && (t.extrato_movimento ?? 0) !== 0)
    const divergentes = tarefasPosto.filter(t => t.extrato_status === 'divergente')

    return {
      posto:               p.nome,
      empresa_externo:     p.codigo_empresa_externo ?? '⚠️ NÃO CONFIGURADO',
      contas_banco:        contasPosto.map(c => `${c.banco} ${c.conta} → codigo=${c.codigo_conta_externo ?? '❌ sem codigo'}`),
      tem_codigo_externo:  temCodigoExterno ? '✅' : '❌ sem codigo_conta_externo',
      tarefas_total:       tarefasPosto.length,
      tarefas_divergentes: divergentes.length,
      tarefas_saldo_zero:  comZero.length,
      exemplo_zero:        comZero[0] ? {
        data:          comZero[0].extrato_data,
        extrato:       comZero[0].extrato_movimento,
        sistema:       comZero[0].extrato_saldo_externo,
        diferenca:     comZero[0].extrato_diferenca,
      } : null,
    }
  })

  const semCodigo = resultado.filter(r => r.tem_codigo_externo === '❌ sem codigo_conta_externo')
  const comZero   = resultado.filter(r => r.tarefas_saldo_zero > 0)

  return NextResponse.json({
    resumo: {
      total_postos:         resultado.length,
      postos_sem_codigo:    semCodigo.length,
      postos_com_saldo_zero: comZero.length,
    },
    postos_com_problema: resultado.filter(r => r.tarefas_saldo_zero > 0 || r.tem_codigo_externo === '❌ sem codigo_conta_externo'),
    todos_postos: resultado,
  })
}
