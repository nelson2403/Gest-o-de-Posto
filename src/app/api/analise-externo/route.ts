import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface DreRow {
  empresa_grid: string
  posto_nome: string
  empresa_codigo: string
  mes: string
  produto: string
  taxa_esperada: number | null
  valor_bruto_total: number
  valor_taxas_real: number
  valor_liquido: number
  valor_taxas_esperado: number
  total_cvs: number
  taxa_efetiva: number
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const dataInicio = searchParams.get('dataInicio') ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  const dataFim    = searchParams.get('dataFim')    ?? new Date().toISOString().slice(0, 10)
  const gridsParam = searchParams.get('empresaGrids') // comma-separated bigints

  const admin = createAdminClient()

  // Empresa lookup
  const { data: empresas } = await admin.from('as_empresa').select('grid, codigo, nome')
  const empresaLookup: Record<string, { codigo: string; nome: string }> = {}
  for (const e of empresas ?? []) empresaLookup[String(e.grid)] = { codigo: e.codigo ?? '', nome: e.nome ?? '' }

  // Produto (cartao_concilia_produto) lookup
  const { data: produtos } = await admin.from('as_cartao_concilia_produto').select('grid, descricao, taxa_perc')
  const produtoLookup: Record<number, { descricao: string; taxa_perc: number | null }> = {}
  for (const p of produtos ?? []) produtoLookup[p.grid] = { descricao: p.descricao ?? '', taxa_perc: p.taxa_perc ?? null }

  // Filter grids
  const grids = gridsParam
    ? gridsParam.split(',').map(g => parseInt(g.trim())).filter(n => !isNaN(n))
    : Object.keys(empresaLookup).map(Number)

  if (!grids.length) return NextResponse.json({ data: [] })

  // Fetch extrato data
  let q = admin
    .from('as_cartao_concilia_extrato')
    .select('empresa, data, produto, extrato')
    .in('empresa', grids)
    .gte('data', dataInicio)
    .lte('data', dataFim)
    .like('extrato', "%Venda/pgto%")

  const { data: extratos, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Parse extrato JSON-like text and aggregate
  // extrato contains text like: "valor_bruto': 1234.56" "taxa': 1.5" "qtde_cvs': 42"
  function extractFloat(text: string, key: string): number {
    const m = text.match(new RegExp(`'${key}':\\s*([0-9]+\\.?[0-9]*)`))
    return m ? parseFloat(m[1]) : 0
  }
  function extractInt(text: string, key: string): number {
    const m = text.match(new RegExp(`'${key}':\\s*([0-9]+)`))
    return m ? parseInt(m[1]) : 0
  }

  type AggKey = string
  const agg: Record<AggKey, {
    empresa_grid: string; empresa_codigo: string; posto_nome: string
    mes: string; produto: string; taxa_esperada: number | null
    valor_bruto: number; valor_taxa_real_sum: number; qtde_cvs: number
  }> = {}

  for (const row of extratos ?? []) {
    const ext = row.extrato ?? ''
    const valor_bruto = extractFloat(ext, 'valor_bruto')
    const taxa_real   = extractFloat(ext, 'taxa')
    const qtde_cvs    = extractInt(ext,   'qtde_cvs')

    const empresaStr  = String(row.empresa)
    const mes         = String(row.data).slice(0, 7)
    const prod        = produtoLookup[row.produto]
    const prodNome    = prod?.descricao ?? 'Sem produto'
    const taxaEsp     = prod?.taxa_perc ?? null
    const emp         = empresaLookup[empresaStr]

    const key = `${empresaStr}|${mes}|${prodNome}`
    if (!agg[key]) agg[key] = {
      empresa_grid:  empresaStr,
      empresa_codigo: emp?.codigo ?? empresaStr,
      posto_nome:    emp?.nome ?? empresaStr,
      mes,
      produto:       prodNome,
      taxa_esperada: taxaEsp,
      valor_bruto:         0,
      valor_taxa_real_sum: 0,
      qtde_cvs:            0,
    }
    agg[key].valor_bruto         += valor_bruto
    agg[key].valor_taxa_real_sum += valor_bruto * taxa_real / 100
    agg[key].qtde_cvs            += qtde_cvs
  }

  const data: DreRow[] = Object.values(agg).map(r => {
    const vb = parseFloat(r.valor_bruto.toFixed(2))
    const vtr = parseFloat(r.valor_taxa_real_sum.toFixed(2))
    const vte = parseFloat((r.valor_bruto * (r.taxa_esperada ?? 0) / 100).toFixed(2))
    const vl  = parseFloat((vb - vtr).toFixed(2))
    const te  = vb > 0 ? parseFloat((vtr / vb * 100).toFixed(4)) : 0
    return {
      empresa_grid:       r.empresa_grid,
      posto_nome:         r.posto_nome,
      empresa_codigo:     r.empresa_codigo,
      mes:                r.mes,
      produto:            r.produto,
      taxa_esperada:      r.taxa_esperada,
      valor_bruto_total:  vb,
      valor_taxas_real:   vtr,
      valor_liquido:      vl,
      valor_taxas_esperado: vte,
      total_cvs:          r.qtde_cvs,
      taxa_efetiva:       te,
    }
  }).sort((a, b) => a.posto_nome.localeCompare(b.posto_nome) || a.mes.localeCompare(b.mes) || a.produto.localeCompare(b.produto))

  return NextResponse.json({ data })
}
