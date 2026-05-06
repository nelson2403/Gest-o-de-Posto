import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  buscarTitulosReceberBalanco,
  buscarTitulosPagarBalanco,
  buscarEmpresasComNomeReduzido,
  type BalancoTitulo,
  type BalancoPagarTitulo,
} from '@/lib/autosystem'

export interface PagarTituloResp extends BalancoPagarTitulo {
  empresa_nome:          string  // nome cheio
  empresa_nome_reduzido: string  // nome reduzido (cai no nome cheio se vazio)
}

export interface ReceberTituloResp extends BalancoTitulo {
  empresa_nome:          string  // nome cheio
  empresa_nome_reduzido: string  // nome reduzido (cai no nome cheio se vazio)
}

export interface BalancoResponse {
  receber:        ReceberTituloResp[] // Conta → Empresa → títulos
  pagar:          PagarTituloResp[]   // Empresa → Conta → títulos
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
    const empresas = await buscarEmpresasComNomeReduzido()
    const empresaIds = empresas.map(e => Number(e.grid)).filter(n => !Number.isNaN(n))

    const empresaInfoById = new Map<number, { nome: string; nome_reduzido: string }>()
    for (const e of empresas) {
      empresaInfoById.set(Number(e.grid), {
        nome:          e.nome,
        nome_reduzido: e.nome_reduzido || e.nome,
      })
    }

    if (!empresaIds.length) {
      return NextResponse.json({
        receber: [], pagar: [],
        totalReceber: 0, totalPagar: 0, saldoProjetado: 0,
        empresas: 0,
        geradoEm: new Date().toISOString(),
      } as BalancoResponse)
    }

    const [receberRaw, pagarRaw] = await Promise.all([
      buscarTitulosReceberBalanco(empresaIds),
      buscarTitulosPagarBalanco(empresaIds),
    ])

    const enriquecer = <T extends { empresa: number }>(t: T) => {
      const info = empresaInfoById.get(t.empresa)
      return {
        ...t,
        empresa_nome:          info?.nome          ?? `Empresa ${t.empresa}`,
        empresa_nome_reduzido: info?.nome_reduzido ?? `Empresa ${t.empresa}`,
      }
    }

    const receber: ReceberTituloResp[] = receberRaw.map(enriquecer)
    const pagar:   PagarTituloResp[]   = pagarRaw.map(enriquecer)

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
