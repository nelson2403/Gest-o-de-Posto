import { NextRequest, NextResponse } from 'next/server'
import { queryAS, buscarEmpresas } from '@/lib/autosystem'

export interface ContaRow {
  empresa_grid: string
  posto_nome: string
  mes: string
  conta_cod: string
  conta_nome: string
  valor_bruto: number
  valor_taxa: number
  valor_liquido: number
  taxa_efetiva: number
  total_cvs: number
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const dataInicio = searchParams.get('dataInicio') ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  const dataFim    = searchParams.get('dataFim')    ?? new Date().toISOString().slice(0, 10)
  const gridsParam = searchParams.get('empresaGrids')

  const empresas = await buscarEmpresas()
  const empresaLookup: Record<string, string> = {}
  for (const e of empresas) empresaLookup[String(e.grid)] = e.nome

  const grids = gridsParam
    ? gridsParam.split(',').map(g => parseInt(g.trim())).filter(n => !isNaN(n))
    : empresas.map(e => e.grid)

  if (!grids.length) return NextResponse.json({ data: [], debug: 'grids vazios' })

  // Busca todas as contas 1.3.x (contas a receber de cartão) com nome
  let nomeMap: Record<string, string> = {}
  try {
    const contaRows = await queryAS<{ codigo: string; nome: string }>(
      `SELECT codigo::text, nome::text FROM conta WHERE codigo LIKE '1.3.%' ORDER BY codigo`,
    )
    for (const c of contaRows) nomeMap[c.codigo] = c.nome
  } catch { /* se tabela não existir, continua sem nomes */ }

  // Total dos créditos na conta do cartão = RECEBIMENTO + TAXA (lado crédito da baixa)
  // Isso representa o valor bruto liquidado pelo processador no período
  const creditRows = await queryAS<{ conta: string; empresa: number; valor_total: number; total_cvs: number }>(
    `SELECT
       m.conta_creditar::text AS conta,
       m.empresa::bigint      AS empresa,
       SUM(m.valor)::float    AS valor_total,
       COUNT(*)::int          AS total_cvs
     FROM movto m
     WHERE m.empresa = ANY($1::bigint[])
       AND m.data BETWEEN $2::date AND $3::date
       AND m.conta_creditar LIKE '1.3.%'
     GROUP BY m.conta_creditar, m.empresa`,
    [grids, dataInicio, dataFim],
  )

  // Taxa: apenas créditos com motivo contendo 'taxa' (TAXA DE CARTOES)
  let taxRows: { conta: string; empresa: number; valor_taxa: number }[] = []
  try {
    taxRows = await queryAS<{ conta: string; empresa: number; valor_taxa: number }>(
      `SELECT
         m.conta_creditar::text AS conta,
         m.empresa::bigint      AS empresa,
         SUM(m.valor)::float    AS valor_taxa
       FROM movto m
       WHERE m.empresa = ANY($1::bigint[])
         AND m.data BETWEEN $2::date AND $3::date
         AND m.conta_creditar LIKE '1.3.%'
         AND m.motivo IN (
           SELECT grid FROM motivo_movto WHERE LOWER(nome::text) LIKE '%taxa%'
         )
       GROUP BY m.conta_creditar, m.empresa`,
      [grids, dataInicio, dataFim],
    )
  } catch { /* ignora erro na busca de taxas */ }

  // Mapa de taxas por conta/empresa
  const taxMap: Record<string, number> = {}
  for (const r of taxRows) {
    const key = `${r.conta}|${r.empresa}`
    taxMap[key] = (taxMap[key] ?? 0) + r.valor_taxa
  }

  // Bruto = total créditos (RECEBIMENTO + TAXA)
  // Taxa  = apenas TAXA DE CARTOES
  // Líquido = Bruto - Taxa = RECEBIMENTO (líquido depositado)
  const data: ContaRow[] = creditRows
    .filter(r => r.valor_total > 0)
    .map(r => {
      const key      = `${r.conta}|${r.empresa}`
      const taxa     = taxMap[key] ?? 0
      const bruto    = r.valor_total
      const liquido  = parseFloat((bruto - taxa).toFixed(2))
      const efetiva  = bruto > 0 ? parseFloat((taxa / bruto * 100).toFixed(4)) : 0
      return {
        empresa_grid:  String(r.empresa),
        posto_nome:    empresaLookup[String(r.empresa)] ?? String(r.empresa),
        mes:           `${dataInicio.slice(0,7)} → ${dataFim.slice(0,7)}`,
        conta_cod:     r.conta,
        conta_nome:    nomeMap[r.conta] ?? r.conta,
        valor_bruto:   parseFloat(bruto.toFixed(2)),
        valor_taxa:    parseFloat(taxa.toFixed(2)),
        valor_liquido: liquido,
        taxa_efetiva:  efetiva,
        total_cvs:     r.total_cvs,
      }
    })
    .sort((a, b) => a.posto_nome.localeCompare(b.posto_nome) || a.conta_nome.localeCompare(b.conta_nome))

  return NextResponse.json({
    data,
    debug: { grids: grids.length, creditRows: creditRows.length, taxRows: taxRows.length, contas: Object.keys(nomeMap).length },
  })
}
