import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  buscarEmpresas,
  aggregarSaldoPorEmpresaConta,
  buscarSaldosIniciaisConta,
} from '@/lib/autosystem'

export interface SaldoConta {
  conta_grid:    string
  conta_codigo:  string
  conta_nome:    string
  saldoInicial:  number  // saldo da conta antes do início do período (D-C de tudo anterior a dataIni)
  totalDebitar:  number  // entradas no período
  totalCreditar: number  // saídas no período
  saldoLiquido:  number  // movimentação líquida no período (D-C)
  saldoFinal:    number  // saldoInicial + saldoLiquido
}

export interface SaldoEmpresa {
  empresa_id:    number
  empresa_nome:  string
  contas:        SaldoConta[]
  saldoInicial:  number
  totalDebitar:  number
  totalCreditar: number
  saldoLiquido:  number
  saldoFinal:    number
}

export interface ControleDinheiroResponse {
  empresas:                SaldoEmpresa[]
  totalGeralSaldoInicial:  number
  totalGeralDebitar:       number
  totalGeralCreditar:      number
  totalGeralLiquido:       number
  totalGeralSaldoFinal:    number
  totalContas:             number
  periodo:                 { dataIni: string | null; dataFim: string | null }
  geradoEm:                string
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const dataIni = searchParams.get('data_ini')
  const dataFim = searchParams.get('data_fim')
  // Validação simples — formato YYYY-MM-DD
  const isValid = (s: string | null) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s)
  if (!isValid(dataIni) || !isValid(dataFim)) {
    return NextResponse.json({ error: 'data_ini e data_fim devem estar no formato YYYY-MM-DD' }, { status: 400 })
  }

  // Carrega contas configuradas
  const { data: contasConfig, error: errCfg } = await supabase
    .from('controle_dinheiro_contas')
    .select('conta_grid, conta_codigo, conta_nome')
    .eq('ativo', true)
    .order('conta_codigo')
  if (errCfg) return NextResponse.json({ error: errCfg.message }, { status: 500 })

  if (!contasConfig?.length) {
    return NextResponse.json({
      empresas: [],
      totalGeralSaldoInicial: 0,
      totalGeralDebitar: 0, totalGeralCreditar: 0, totalGeralLiquido: 0,
      totalGeralSaldoFinal: 0,
      totalContas: 0,
      periodo: { dataIni, dataFim },
      geradoEm: new Date().toISOString(),
    } as ControleDinheiroResponse)
  }

  try {
    const empresasAS = await buscarEmpresas()
    const empresaNomeById = new Map<number, string>()
    for (const e of empresasAS) empresaNomeById.set(Number(e.grid), e.nome)
    const empresaIds = Array.from(empresaNomeById.keys())

    const codigos = contasConfig.map(c => c.conta_codigo)

    // Saldo inicial: agregação até o dia ANTERIOR a dataIni. Se dataIni for nulo,
    // não há saldo inicial (todo o período já está dentro da janela).
    const dataAntesIni = dataIni
      ? (() => {
          const d = new Date(`${dataIni}T00:00:00`)
          d.setDate(d.getDate() - 1)
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        })()
      : null

    const [saldosPeriodo, saldosInicial, saldosImplantacao] = await Promise.all([
      empresaIds.length && codigos.length
        ? aggregarSaldoPorEmpresaConta(empresaIds, codigos, dataIni, dataFim)
        : Promise.resolve([]),
      empresaIds.length && codigos.length && dataAntesIni
        ? aggregarSaldoPorEmpresaConta(empresaIds, codigos, null, dataAntesIni)
        : Promise.resolve([]),
      // Saldo de implantação (conta.saldo_inicial) — independente de período,
      // entra como base do saldo inicial.
      empresaIds.length && codigos.length
        ? buscarSaldosIniciaisConta(empresaIds, codigos)
        : Promise.resolve(new Map<string, number>()),
    ])

    // Indexa saldos por (empresa, codigo)
    const saldoMap = new Map<string, { debitar: number; creditar: number }>()
    for (const s of saldosPeriodo) {
      const key = `${s.empresa}:${s.codigo}`
      saldoMap.set(key, {
        debitar:  Number(s.total_debitar),
        creditar: Number(s.total_creditar),
      })
    }
    const inicialMap = new Map<string, number>()
    for (const s of saldosInicial) {
      const key = `${s.empresa}:${s.codigo}`
      inicialMap.set(key, Number(s.total_debitar) - Number(s.total_creditar))
    }
    // Helper: lookup do saldo de implantação por (empresa, codigo) — cai pro
    // escopo global (`:${codigo}`) quando o plano de contas é compartilhado.
    const saldoImplantacaoFor = (empresaId: number, codigo: string): number =>
      saldosImplantacao.get(`${empresaId}:${codigo}`)
        ?? saldosImplantacao.get(`:${codigo}`)
        ?? 0

    // Monta tree empresa → contas. Inclui contas com saldo inicial OU movimentação.
    const empresas: SaldoEmpresa[] = []
    for (const empId of empresaIds) {
      const contas: SaldoConta[] = []
      for (const c of contasConfig) {
        const key = `${empId}:${c.conta_codigo}`
        const s = saldoMap.get(key)
        // Empresa só "tem" essa conta se houver pelo menos um movto (no período
        // OU em qualquer momento anterior). Como o plano de contas é global,
        // sem essa checagem o saldo de implantação apareceria em todas as
        // empresas, mesmo as que nunca usaram a conta.
        const empresaUsaConta = saldoMap.has(key) || inicialMap.has(key)
        const saldoImplantacao = empresaUsaConta
          ? saldoImplantacaoFor(empId, c.conta_codigo)
          : 0
        const saldoInicial = saldoImplantacao + (inicialMap.get(key) ?? 0)
        const totalDebitar  = s?.debitar  ?? 0
        const totalCreditar = s?.creditar ?? 0
        // Omite se NÃO houver nenhuma movimentação (nem saldo inicial nem período)
        if (saldoInicial === 0 && totalDebitar === 0 && totalCreditar === 0) continue
        const saldoLiquido = totalDebitar - totalCreditar
        contas.push({
          conta_grid:    String(c.conta_grid),
          conta_codigo:  c.conta_codigo,
          conta_nome:    c.conta_nome ?? c.conta_codigo,
          saldoInicial,
          totalDebitar,
          totalCreditar,
          saldoLiquido,
          saldoFinal:    saldoInicial + saldoLiquido,
        })
      }
      if (contas.length === 0) continue
      const saldoInicial  = contas.reduce((s, c) => s + c.saldoInicial,  0)
      const totalDebitar  = contas.reduce((s, c) => s + c.totalDebitar,  0)
      const totalCreditar = contas.reduce((s, c) => s + c.totalCreditar, 0)
      const saldoLiquido  = totalDebitar - totalCreditar
      empresas.push({
        empresa_id:    empId,
        empresa_nome:  empresaNomeById.get(empId) ?? `Empresa ${empId}`,
        contas,
        saldoInicial,
        totalDebitar,
        totalCreditar,
        saldoLiquido,
        saldoFinal:    saldoInicial + saldoLiquido,
      })
    }
    empresas.sort((a, b) => b.saldoFinal - a.saldoFinal)

    const totalGeralSaldoInicial = empresas.reduce((s, e) => s + e.saldoInicial,  0)
    const totalGeralDebitar      = empresas.reduce((s, e) => s + e.totalDebitar,  0)
    const totalGeralCreditar     = empresas.reduce((s, e) => s + e.totalCreditar, 0)
    const totalGeralLiquido      = totalGeralDebitar - totalGeralCreditar

    const resp: ControleDinheiroResponse = {
      empresas,
      totalGeralSaldoInicial,
      totalGeralDebitar,
      totalGeralCreditar,
      totalGeralLiquido,
      totalGeralSaldoFinal: totalGeralSaldoInicial + totalGeralLiquido,
      totalContas:          contasConfig.length,
      periodo:              { dataIni, dataFim },
      geradoEm:             new Date().toISOString(),
    }
    return NextResponse.json(resp)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao consultar AUTOSYSTEM'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
