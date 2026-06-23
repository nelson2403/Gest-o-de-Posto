import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { exigirUsuario } from "@/lib/auth-guard"

// GET — encontra boletos que correspondem a contas a pagar
// Matching por: fornecedor + valor + vencimento
export async function GET(req: NextRequest) {
  try {
    const auth = await exigirUsuario()
    if (!auth.ok) return auth.resp
    const admin = createAdminClient()

    // 1. Busca todas as contas a pagar pendentes
    const { data: contasPagar } = await admin
      .from('solicitacoes_pagamento')
      .select('id, fornecedor, valor, data_vencimento, status')
      .in('status', ['pendente', 'aguardando'])
      .not('valor', 'is', null)
      .not('data_vencimento', 'is', null)

    if (!contasPagar?.length) {
      return NextResponse.json({ matching: [], total: 0 })
    }

    // 2. Busca todos os boletos fiscais pendentes
    const { data: boletos } = await admin
      .from('fiscal_tarefas')
      .select('id, fornecedor_nome, boleto_valor, boleto_vencimento, status')
      .in('status', ['pendente_gerente', 'aguardando_fiscal', 'concluida'])
      .not('boleto_valor', 'is', null)
      .not('boleto_vencimento', 'is', null)

    // 3. Faz o matching (MAIS RIGOROSO)
    const matching = []
    for (const conta of contasPagar) {
      const boleto = boletos?.find(b => {
        // Normaliza nomes removendo caracteres especiais
        const normalizaConta = conta.fornecedor?.toUpperCase().replace(/[^\w\s]/g, '') ?? ''
        const normalizaBoleto = b.fornecedor_nome?.toUpperCase().replace(/[^\w\s]/g, '') ?? ''

        // Match exato OU pelo menos 80% de similaridade
        const fornecedorMatch =
          normalizaConta === normalizaBoleto ||
          (normalizaConta.length > 10 && normalizaBoleto.includes(normalizaConta.substring(0, 15)))

        // Valor exato (tolerância de R$ 0,01)
        const valorMatch = Math.abs(Number(conta.valor) - Number(b.boleto_valor)) < 0.01

        // Vencimento exato
        const vencimentoMatch =
          String(conta.data_vencimento) === String(b.boleto_vencimento)

        return fornecedorMatch && valorMatch && vencimentoMatch
      })

      if (boleto) {
        matching.push({
          conta_id: conta.id,
          boleto_id: boleto.id,
          fornecedor: conta.fornecedor,
          valor: conta.valor,
          vencimento: conta.data_vencimento,
          status_conta: conta.status,
          status_boleto: boleto.status,
          conciliado: true
        })
      }
    }

    return NextResponse.json({
      matching,
      total: matching.length,
      contas_totais: contasPagar.length,
      boletos_totais: boletos?.length ?? 0,
      nao_conciliadas: (contasPagar.length - matching.length)
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
