import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/contas-pagar/{id}/matching
// Verifica se uma conta a pagar específica tem boleto correspondente
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const admin = createAdminClient()

    // 1. Busca a conta específica
    const { data: conta } = await admin
      .from('solicitacoes_pagamento')
      .select('id, fornecedor, valor, data_vencimento')
      .eq('id', id)
      .single()

    if (!conta) {
      return NextResponse.json({ encontrado: false, boleto_id: null })
    }

    // 2. Busca boletos que possam corresponder
    const { data: boletos } = await admin
      .from('fiscal_tarefas')
      .select('id, fornecedor_nome, boleto_valor, boleto_vencimento')
      .in('status', ['pendente_gerente', 'aguardando_fiscal', 'concluida'])
      .not('boleto_valor', 'is', null)
      .not('boleto_vencimento', 'is', null)

    // 3. Faz matching rigoroso
    const boleto = boletos?.find(b => {
      const normalizaConta = conta.fornecedor?.toUpperCase().replace(/[^\w\s]/g, '') ?? ''
      const normalizaBoleto = b.fornecedor_nome?.toUpperCase().replace(/[^\w\s]/g, '') ?? ''

      const fornecedorMatch =
        normalizaConta === normalizaBoleto ||
        (normalizaConta.length > 10 && normalizaBoleto.includes(normalizaConta.substring(0, 15)))

      const valorMatch = Math.abs(Number(conta.valor) - Number(b.boleto_valor)) < 0.01
      const vencimentoMatch = String(conta.data_vencimento) === String(b.boleto_vencimento)

      return fornecedorMatch && valorMatch && vencimentoMatch
    })

    return NextResponse.json({
      encontrado: !!boleto,
      boleto_id: boleto?.id ?? null,
      fornecedor: conta.fornecedor,
      valor: conta.valor,
      vencimento: conta.data_vencimento
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
