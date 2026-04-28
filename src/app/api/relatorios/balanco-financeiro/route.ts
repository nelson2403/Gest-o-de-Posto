import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buscarBalancoFinanceiro, buscarEmpresas, type BalancoTitulo } from '@/lib/autosystem'

export interface BalancoResponse {
  receber:        BalancoTitulo[]
  pagar:          BalancoTitulo[]
  totalReceber:   number
  totalPagar:     number
  saldoProjetado: number
  empresas:       number
  geradoEm:       string  // ISO timestamp da geração
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    // Pega TODAS as empresas do AUTOSYSTEM (não apenas as marcadas como `posto` no Supabase),
    // garantindo que entidades como MATRIZ e TRANSPOMBAL — que não são postos mas têm
    // movimentação financeira — entrem no balanço.
    const empresas = await buscarEmpresas()
    const empresaIds = empresas.map(e => Number(e.grid)).filter(n => !Number.isNaN(n))

    if (!empresaIds.length) {
      return NextResponse.json({
        receber: [], pagar: [],
        totalReceber: 0, totalPagar: 0, saldoProjetado: 0,
        empresas: 0,
        geradoEm: new Date().toISOString(),
      } as BalancoResponse)
    }

    const { receber, pagar } = await buscarBalancoFinanceiro(empresaIds)
    const totalReceber = receber.reduce((s, t) => s + t.valor, 0)
    const totalPagar   = pagar.reduce((s, t) => s + t.valor, 0)
    const resp: BalancoResponse = {
      receber,
      pagar,
      totalReceber,
      totalPagar,
      saldoProjetado: totalReceber - totalPagar,
      empresas:       empresaIds.length,
      geradoEm:       new Date().toISOString(),
    }
    return NextResponse.json(resp)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao consultar AUTOSYSTEM'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
