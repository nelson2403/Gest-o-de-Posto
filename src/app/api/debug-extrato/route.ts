import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/debug-extrato?posto_id=XXX&data=YYYY-MM-DD
// Diagnóstico: mostra exatamente o que o mirror tem para aquele posto/data
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const postoId = searchParams.get('posto_id')
  const data    = searchParams.get('data')

  if (!postoId || !data)
    return NextResponse.json({ error: 'posto_id e data são obrigatórios' }, { status: 400 })

  const admin = createAdminClient()

  // 1. Busca posto
  const { data: posto } = await admin
    .from('postos')
    .select('id, nome, codigo_empresa_externo')
    .eq('id', postoId)
    .single()

  // 2. Busca conta bancária configurada
  const { data: contas } = await admin
    .from('contas_bancarias')
    .select('id, banco, codigo_conta_externo')
    .eq('posto_id', postoId)

  const contaCodigo = contas?.find(c => c.codigo_conta_externo)?.codigo_conta_externo ?? null
  const empresaId   = posto?.codigo_empresa_externo ? parseInt(posto.codigo_empresa_externo) : null

  if (!empresaId)
    return NextResponse.json({ erro: 'Posto sem codigo_empresa_externo', posto })

  // 3. Busca movtos do dia no mirror
  const { data: movtos, error: movErr } = await admin
    .from('as_movto')
    .select('grid, conta_debitar, conta_creditar, valor, motivo, tipo_doc')
    .eq('empresa', empresaId)
    .eq('data', data)

  if (movErr)
    return NextResponse.json({ erro: movErr.message })

  // 4. Verifica se conta_creditar está populada
  const totalMovtos        = movtos?.length ?? 0
  const comContaCreditar   = movtos?.filter(m => m.conta_creditar !== null).length ?? 0
  const semContaCreditar   = movtos?.filter(m => m.conta_creditar === null).length ?? 0

  // 5. Calcula movimento com conta específica (se configurada)
  let calcComConta = null
  if (contaCodigo) {
    const debito  = (movtos ?? []).filter(m => m.conta_debitar  === contaCodigo).reduce((s, m) => s + (m.valor ?? 0), 0)
    const credito = (movtos ?? []).filter(m => m.conta_creditar === contaCodigo).reduce((s, m) => s + (m.valor ?? 0), 0)
    calcComConta  = {
      debito:   parseFloat(debito.toFixed(2)),
      credito:  parseFloat(credito.toFixed(2)),
      movimento: parseFloat((debito - credito).toFixed(2)),
      registros_debito:  movtos?.filter(m => m.conta_debitar  === contaCodigo).length,
      registros_credito: movtos?.filter(m => m.conta_creditar === contaCodigo).length,
    }
  }

  // 6. Calcula com fallback 1.2.*
  const deb12   = (movtos ?? []).filter(m => m.conta_debitar?.startsWith('1.2.')  && !m.conta_creditar?.startsWith('1.2.')).reduce((s, m) => s + (m.valor ?? 0), 0)
  const cred12  = (movtos ?? []).filter(m => m.conta_creditar?.startsWith('1.2.') && !m.conta_debitar?.startsWith('1.2.')).reduce((s, m) => s + (m.valor ?? 0), 0)
  const calcFallback = {
    debito:    parseFloat(deb12.toFixed(2)),
    credito:   parseFloat(cred12.toFixed(2)),
    movimento: parseFloat((deb12 - cred12).toFixed(2)),
  }

  // 7. Todas as contas distintas no dia (para ajudar a identificar a conta certa)
  const contasDistintas = [...new Set([
    ...(movtos ?? []).map(m => m.conta_debitar).filter(Boolean),
    ...(movtos ?? []).map(m => m.conta_creditar).filter(Boolean),
  ])].sort()

  // 8. Contas 1.2.* com seus totais
  const contas12 = contasDistintas
    .filter(c => c?.startsWith('1.2.'))
    .map(c => {
      const deb = (movtos ?? []).filter(m => m.conta_debitar  === c).reduce((s, m) => s + (m.valor ?? 0), 0)
      const cre = (movtos ?? []).filter(m => m.conta_creditar === c).reduce((s, m) => s + (m.valor ?? 0), 0)
      return { conta: c, debito: parseFloat(deb.toFixed(2)), credito: parseFloat(cre.toFixed(2)), movimento: parseFloat((deb - cre).toFixed(2)) }
    })

  return NextResponse.json({
    posto:           { id: postoId, nome: posto?.nome, empresa_grid: empresaId },
    data,
    conta_mapeada:   contaCodigo ?? '(nenhuma — usando fallback 1.2.*)',
    contas_banco_cadastradas: contas,
    mirror_as_movto: {
      total_registros:      totalMovtos,
      com_conta_creditar:   comContaCreditar,
      sem_conta_creditar:   semContaCreditar,
      alerta_creditar_null: semContaCreditar > 0 ? `⚠️ ${semContaCreditar} registros com conta_creditar NULL — coluna pode não existir no Supabase` : '✅ OK',
    },
    calculo_com_conta_mapeada: calcComConta ?? '(conta não mapeada)',
    calculo_fallback_1_2:  calcFallback,
    contas_1_2_no_dia:     contas12,
    todas_contas_distintas: contasDistintas,
  })
}
