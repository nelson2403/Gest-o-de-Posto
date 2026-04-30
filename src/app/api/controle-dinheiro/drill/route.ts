import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  listarMovtosCaixaPorPeriodo,
  aggregarSaldoPorEmpresaConta,
  buscarSaldosIniciaisConta,
  type MovtoCaixaLancamento,
} from '@/lib/autosystem'

export interface LancamentoDia {
  valor:     number
  direcao:   'D' | 'C'
  motivo:    string
  historico: string
  documento: string | null
  pessoa:    string
}

export interface DiaSaldo {
  data:         string  // YYYY-MM-DD
  saldoInicial: number
  entradas:     number
  saidas:       number
  saldoFinal:   number
  lancamentos:  LancamentoDia[]
}

export interface DrillResponse {
  saldoInicialPeriodo: number
  dias:                DiaSaldo[]
}

const isValidDate = (s: string | null) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s)

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const empresaIdStr = sp.get('empresa_id')
  const contaCodigo  = sp.get('conta_codigo')
  const dataIni      = sp.get('data_ini')
  const dataFim      = sp.get('data_fim')

  if (!empresaIdStr || !contaCodigo) {
    return NextResponse.json({ error: 'empresa_id e conta_codigo são obrigatórios' }, { status: 400 })
  }
  if (!isValidDate(dataIni) || !isValidDate(dataFim)) {
    return NextResponse.json({ error: 'datas devem estar no formato YYYY-MM-DD' }, { status: 400 })
  }
  const empresaId = Number(empresaIdStr)
  if (Number.isNaN(empresaId)) {
    return NextResponse.json({ error: 'empresa_id inválido' }, { status: 400 })
  }

  try {
    // Saldo inicial = implantação (conta.saldo_inicial, vinda de migração de
    // sistemas anteriores) + acumulado de movtos antes do período.
    let saldoInicialPeriodo = 0

    const saldosImplantacao = await buscarSaldosIniciaisConta([empresaId], [contaCodigo])
    saldoInicialPeriodo += saldosImplantacao.get(`${empresaId}:${contaCodigo}`)
                       ?? saldosImplantacao.get(`:${contaCodigo}`)
                       ?? 0

    if (dataIni) {
      const d = new Date(`${dataIni}T00:00:00`)
      d.setDate(d.getDate() - 1)
      const dataAntes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const saldosAntes = await aggregarSaldoPorEmpresaConta([empresaId], [contaCodigo], null, dataAntes)
      const s = saldosAntes.find(x => Number(x.empresa) === empresaId && x.codigo === contaCodigo)
      if (s) saldoInicialPeriodo += Number(s.total_debitar) - Number(s.total_creditar)
    }

    // Lançamentos individuais no período
    const lancsRaw = await listarMovtosCaixaPorPeriodo(empresaId, contaCodigo, dataIni, dataFim, 5000)

    // Agrupa por dia, mantendo ordem cronológica
    const diaMap = new Map<string, MovtoCaixaLancamento[]>()
    for (const l of lancsRaw) {
      if (!diaMap.has(l.data)) diaMap.set(l.data, [])
      diaMap.get(l.data)!.push(l)
    }
    const datasOrdenadas = Array.from(diaMap.keys()).sort()

    const dias: DiaSaldo[] = []
    let saldoCorrente = saldoInicialPeriodo
    for (const data of datasOrdenadas) {
      const lancs = diaMap.get(data)!
      const entradas = lancs.filter(l => l.direcao === 'D').reduce((s, l) => s + l.valor, 0)
      const saidas   = lancs.filter(l => l.direcao === 'C').reduce((s, l) => s + l.valor, 0)
      const saldoIni = saldoCorrente
      const saldoFim = saldoIni + entradas - saidas
      saldoCorrente  = saldoFim
      dias.push({
        data,
        saldoInicial: saldoIni,
        entradas,
        saidas,
        saldoFinal:   saldoFim,
        lancamentos:  lancs.map(l => ({
          valor:     l.valor,
          direcao:   l.direcao,
          motivo:    l.motivo,
          historico: l.historico,
          documento: l.documento,
          pessoa:    l.pessoa,
        })),
      })
    }

    const resp: DrillResponse = { saldoInicialPeriodo, dias }
    return NextResponse.json(resp)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao consultar AUTOSYSTEM'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
