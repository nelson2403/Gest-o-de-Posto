import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/debug-mapear-contas
// Para cada posto sem codigo_conta_externo, descobre qual conta 1.2.* existe no as_movto
// e sugere o mapeamento a ser configurado em contas_bancarias
export async function GET() {
  const admin = createAdminClient()

  // 1. Postos com empresa configurada
  const { data: postos } = await admin
    .from('postos')
    .select('id, nome, codigo_empresa_externo')
    .not('codigo_empresa_externo', 'is', null)
    .order('nome')

  // 2. Contas bancárias de cada posto
  const { data: contas } = await admin
    .from('contas_bancarias')
    .select('id, posto_id, banco, agencia, conta, codigo_conta_externo')

  const contaMap: Record<string, any[]> = {}
  for (const c of contas ?? []) {
    if (!c.posto_id) continue
    if (!contaMap[c.posto_id]) contaMap[c.posto_id] = []
    contaMap[c.posto_id].push(c)
  }

  // 3. Para cada posto sem codigo_conta_externo, busca as contas 1.2.* no mirror
  const resultado = []

  for (const p of postos ?? []) {
    const contasPosto = contaMap[p.id] ?? []
    const todasConfiguradas = contasPosto.length > 0 && contasPosto.every(c => c.codigo_conta_externo)

    if (todasConfiguradas) continue // já configurado

    const empresaId = parseInt(p.codigo_empresa_externo!)

    // Busca contas 1.2.* usadas nos últimos 30 dias
    const { data: movtos } = await admin
      .from('as_movto')
      .select('conta_debitar, conta_creditar, valor')
      .eq('empresa', empresaId)
      .gte('data', new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))

    if (!movtos || movtos.length === 0) {
      resultado.push({
        posto: p.nome,
        posto_id: p.id,
        empresa_grid: empresaId,
        contas_banco: contasPosto.map(c => ({ id: c.id, banco: c.banco, conta: c.conta, codigo_atual: c.codigo_conta_externo })),
        contas_1_2_encontradas: [],
        status: '⚠️ sem movimentos nos últimos 30 dias',
      })
      continue
    }

    // Soma por conta 1.2.*
    const totais: Record<string, { debito: number; credito: number; movimentos: number }> = {}
    for (const m of movtos) {
      for (const side of ['conta_debitar', 'conta_creditar'] as const) {
        const c = m[side]
        if (c?.startsWith('1.2.')) {
          if (!totais[c]) totais[c] = { debito: 0, credito: 0, movimentos: 0 }
          if (side === 'conta_debitar') totais[c].debito += m.valor ?? 0
          else totais[c].credito += m.valor ?? 0
          totais[c].movimentos++
        }
      }
    }

    const contas12 = Object.entries(totais)
      .map(([conta, t]) => ({
        conta,
        debito:     parseFloat(t.debito.toFixed(2)),
        credito:    parseFloat(t.credito.toFixed(2)),
        movimento:  parseFloat((t.debito - t.credito).toFixed(2)),
        movimentos: t.movimentos,
      }))
      .sort((a, b) => b.movimentos - a.movimentos)

    resultado.push({
      posto: p.nome,
      posto_id: p.id,
      empresa_grid: empresaId,
      contas_banco: contasPosto.map(c => ({ id: c.id, banco: c.banco, conta: c.conta, codigo_atual: c.codigo_conta_externo })),
      contas_1_2_encontradas: contas12,
      sugestao: contas12.length === 1
        ? `✅ Configurar codigo_conta_externo = '${contas12[0].conta}' para conta ${contasPosto[0]?.conta ?? '?'}`
        : contas12.length > 1
          ? `⚠️ ${contas12.length} contas 1.2.* encontradas — verificar qual corresponde a cada banco`
          : '❌ nenhuma conta 1.2.* encontrada — empresa pode não ter movimentos bancários',
    })
  }

  return NextResponse.json({
    total_sem_configurar: resultado.length,
    postos: resultado,
  })
}
