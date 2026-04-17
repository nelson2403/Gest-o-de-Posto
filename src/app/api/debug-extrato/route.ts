import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/debug-extrato?posto_nome=REAL+SUL&data=YYYY-MM-DD
// OU  /api/debug-extrato?posto_id=XXX&data=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const postoId   = searchParams.get('posto_id')
  const postoNome = searchParams.get('posto_nome')
  const data      = searchParams.get('data')

  if (!data)
    return NextResponse.json({ error: 'data é obrigatória (YYYY-MM-DD)' }, { status: 400 })
  if (!postoId && !postoNome)
    return NextResponse.json({ error: 'Informe posto_id ou posto_nome' }, { status: 400 })

  const admin = createAdminClient()

  // 1. Busca posto
  let postoQuery = admin.from('postos').select('id, nome, codigo_empresa_externo')
  if (postoId)   postoQuery = postoQuery.eq('id', postoId) as any
  else           postoQuery = postoQuery.ilike('nome', `%${postoNome}%`) as any

  const { data: postos } = await (postoQuery as any)

  if (!postos || postos.length === 0)
    return NextResponse.json({ erro: 'Posto não encontrado' }, { status: 404 })

  if (postos.length > 1)
    return NextResponse.json({ erro: 'Múltiplos postos encontrados — seja mais específico', postos: postos.map((p: any) => ({ id: p.id, nome: p.nome })) })

  const posto = postos[0]
  const empresaId = posto.codigo_empresa_externo ? parseInt(posto.codigo_empresa_externo) : null

  if (!empresaId)
    return NextResponse.json({ erro: 'Posto sem codigo_empresa_externo', posto })

  // 2. Busca conta bancária
  const { data: contas } = await admin
    .from('contas_bancarias')
    .select('id, banco, agencia, conta, codigo_conta_externo')
    .eq('posto_id', posto.id)

  const contaCodigo = contas?.find((c: any) => c.codigo_conta_externo)?.codigo_conta_externo ?? null

  // 3. Busca movtos do dia no mirror
  const { data: movtos, error: movErr } = await admin
    .from('as_movto')
    .select('grid, conta_debitar, conta_creditar, valor, motivo, tipo_doc')
    .eq('empresa', empresaId)
    .eq('data', data)

  if (movErr)
    return NextResponse.json({ erro: movErr.message })

  const totalMovtos      = movtos?.length ?? 0
  const comCreditar      = movtos?.filter((m: any) => m.conta_creditar !== null).length ?? 0
  const semCreditar      = movtos?.filter((m: any) => m.conta_creditar === null).length ?? 0

  // 4. Cálculo com conta específica
  let calcComConta: any = null
  if (contaCodigo) {
    const deb = (movtos ?? []).filter((m: any) => m.conta_debitar  === contaCodigo).reduce((s: number, m: any) => s + (m.valor ?? 0), 0)
    const cre = (movtos ?? []).filter((m: any) => m.conta_creditar === contaCodigo).reduce((s: number, m: any) => s + (m.valor ?? 0), 0)
    calcComConta = {
      entradas_debito:  parseFloat(deb.toFixed(2)),
      saidas_credito:   parseFloat(cre.toFixed(2)),
      movimento:        parseFloat((deb - cre).toFixed(2)),
      registros_debito:  (movtos ?? []).filter((m: any) => m.conta_debitar  === contaCodigo).length,
      registros_credito: (movtos ?? []).filter((m: any) => m.conta_creditar === contaCodigo).length,
    }
  }

  // 5. Fallback 1.2.* (exclui transferências internas entre contas bancárias)
  const deb12  = (movtos ?? []).filter((m: any) => m.conta_debitar?.startsWith('1.2.')  && !m.conta_creditar?.startsWith('1.2.')).reduce((s: number, m: any) => s + (m.valor ?? 0), 0)
  const cre12  = (movtos ?? []).filter((m: any) => m.conta_creditar?.startsWith('1.2.') && !m.conta_debitar?.startsWith('1.2.')).reduce((s: number, m: any) => s + (m.valor ?? 0), 0)

  // 5b. Fallback 1.2.* SEM excluir transferências internas
  const deb12all = (movtos ?? []).filter((m: any) => m.conta_debitar?.startsWith('1.2.')).reduce((s: number, m: any) => s + (m.valor ?? 0), 0)
  const cre12all = (movtos ?? []).filter((m: any) => m.conta_creditar?.startsWith('1.2.')).reduce((s: number, m: any) => s + (m.valor ?? 0), 0)

  // 5c. Transferências internas entre contas 1.2.* (ambos os lados são 1.2.*)
  const transfsInternas = (movtos ?? []).filter((m: any) => m.conta_debitar?.startsWith('1.2.') && m.conta_creditar?.startsWith('1.2.*'))
  const transfersInternasDebito  = (movtos ?? []).filter((m: any) => m.conta_debitar?.startsWith('1.2.')  && m.conta_creditar?.startsWith('1.2.')).reduce((s: number, m: any) => s + (m.valor ?? 0), 0)
  const transfersInternasCredito = transfersInternasDebito // sempre iguais

  // 6. Todas as contas distintas
  const contasDistintas = [...new Set([
    ...(movtos ?? []).map((m: any) => m.conta_debitar).filter(Boolean),
    ...(movtos ?? []).map((m: any) => m.conta_creditar).filter(Boolean),
  ])].sort()

  // 7. Contas 1.2.* com totais
  const contas12 = contasDistintas
    .filter((c: any) => c?.startsWith('1.2.'))
    .map((c: any) => {
      const deb = (movtos ?? []).filter((m: any) => m.conta_debitar  === c).reduce((s: number, m: any) => s + (m.valor ?? 0), 0)
      const cre = (movtos ?? []).filter((m: any) => m.conta_creditar === c).reduce((s: number, m: any) => s + (m.valor ?? 0), 0)
      return {
        conta: c,
        entradas_debito: parseFloat(deb.toFixed(2)),
        saidas_credito:  parseFloat(cre.toFixed(2)),
        movimento: parseFloat((deb - cre).toFixed(2))
      }
    })

  return NextResponse.json({
    posto:          { id: posto.id, nome: posto.nome, empresa_grid: empresaId },
    data,
    conta_mapeada:  contaCodigo ?? '(nenhuma — usando fallback 1.2.*)',
    contas_banco:   contas,

    mirror_as_movto: {
      total_registros: totalMovtos,
      com_conta_creditar: comCreditar,
      sem_conta_creditar: semCreditar,
      alerta: semCreditar > 0
        ? `⚠️ ${semCreditar} de ${totalMovtos} registros com conta_creditar NULL`
        : '✅ conta_creditar preenchida em todos os registros',
    },

    calculo_conta_mapeada: calcComConta ?? '(conta não mapeada em contas_bancarias)',

    calculo_fallback_sem_transf_internas: {
      entradas_debito: parseFloat(deb12.toFixed(2)),
      saidas_credito:  parseFloat(cre12.toFixed(2)),
      movimento:       parseFloat((deb12 - cre12).toFixed(2)),
      nota: 'Exclui movtos onde ambos conta_debitar e conta_creditar começam com 1.2.*',
    },

    calculo_fallback_com_transf_internas: {
      entradas_debito: parseFloat(deb12all.toFixed(2)),
      saidas_credito:  parseFloat(cre12all.toFixed(2)),
      movimento:       parseFloat((deb12all - cre12all).toFixed(2)),
      transf_internas_valor: parseFloat(transfersInternasDebito.toFixed(2)),
      nota: 'Inclui TODOS os movtos 1.2.* (inclusive transferências entre contas bancárias)',
    },

    contas_1_2_detalhe: contas12,
    todas_contas_distintas: contasDistintas,
  })
}
