import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface MaqTefRow {
  empresa_grid: string
  numero_serie: string
  nome_tef: string
  hospedado: boolean
}

export interface TefEmpresaRow {
  empresa_grid:     string
  total_transacoes: number
  ultima_transacao: string | null
  total_caixas:     number
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const gridsParam = searchParams.get('empresaGrids')
  const dataInicio = searchParams.get('dataInicio')
  const dataFim    = searchParams.get('dataFim')

  if (!gridsParam) return NextResponse.json({ data: [], resumo: [] })

  const grids = gridsParam
    .split(',')
    .map(g => parseInt(g.trim()))
    .filter(n => !isNaN(n))

  if (grids.length === 0) return NextResponse.json({ data: [], resumo: [] })

  const dtInicio = dataInicio ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  const dtFim    = dataFim    ?? new Date().toISOString().slice(0, 10)

  const admin = createAdminClient()

  // 1. Caixas no período para as empresas
  const { data: caixas, error: errC } = await admin
    .from('as_caixa')
    .select('grid, empresa, data')
    .in('empresa', grids)
    .gte('data', dtInicio)
    .lte('data', dtFim)

  if (errC) return NextResponse.json({ error: errC.message }, { status: 500 })

  const caixaGrids       = (caixas ?? []).map(c => c.grid)
  const caixaByGrid: Record<number, { empresa: number; data: string }> = {}
  for (const c of caixas ?? []) caixaByGrid[c.grid] = { empresa: c.empresa, data: c.data }

  // 2. Transações TEF para esses caixas
  let tefData: { grid: number; caixa: number }[] = []
  if (caixaGrids.length > 0) {
    const { data: tef, error: errT } = await admin
      .from('as_tef_transacao')
      .select('grid, caixa')
      .in('caixa', caixaGrids)

    if (errT) return NextResponse.json({ error: errT.message }, { status: 500 })
    tefData = tef ?? []
  }

  // 3. Agrega por empresa
  const byEmpresa: Record<number, { transacoes: Set<number>; caixas: Set<number>; maxData: string }> = {}
  for (const t of tefData) {
    const c = caixaByGrid[t.caixa]
    if (!c) continue
    if (!byEmpresa[c.empresa]) byEmpresa[c.empresa] = { transacoes: new Set(), caixas: new Set(), maxData: '' }
    byEmpresa[c.empresa].transacoes.add(t.grid)
    byEmpresa[c.empresa].caixas.add(t.caixa)
    if (c.data > byEmpresa[c.empresa].maxData) byEmpresa[c.empresa].maxData = c.data
  }

  const resumo: TefEmpresaRow[] = grids.map(g => ({
    empresa_grid:     String(g),
    total_transacoes: byEmpresa[g]?.transacoes.size ?? 0,
    ultima_transacao: byEmpresa[g]?.maxData || null,
    total_caixas:     byEmpresa[g]?.caixas.size ?? 0,
  }))

  // 4. Terminais TEF (as_empresa_tef — pode estar vazio)
  const { data: tefTerminais } = await admin
    .from('as_empresa_tef')
    .select('empresa, codigo, nome, hospedado')
    .in('empresa', grids)
    .order('empresa')
    .order('codigo')

  const data: MaqTefRow[] = (tefTerminais ?? []).map(t => ({
    empresa_grid: String(t.empresa),
    numero_serie: t.codigo,
    nome_tef:     t.nome ?? '',
    hospedado:    t.hospedado ?? false,
  }))

  return NextResponse.json({ data, resumo })
}
