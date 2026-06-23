import { NextRequest, NextResponse } from 'next/server'
import { buscarCaixas, buscarTefTransacoes } from '@/lib/autosystem'
import { Pool } from 'pg'
import { exigirUsuario } from "@/lib/auth-guard"

function getPool() {
  return new Pool({
    host:     process.env.EXT_DB_HOST     ?? '192.168.2.200',
    port:     Number(process.env.EXT_DB_PORT ?? 5432),
    database: process.env.EXT_DB_NAME     ?? 'matriz',
    user:     process.env.EXT_DB_USER     ?? 'app_readonly',
    password: process.env.EXT_DB_PASSWORD ?? '',
    max: 3,
  })
}

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

  const grids = gridsParam.split(',').map(g => parseInt(g.trim())).filter(n => !isNaN(n))
  if (grids.length === 0) return NextResponse.json({ data: [], resumo: [] })

  const dtInicio = dataInicio ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  const dtFim    = dataFim    ?? new Date().toISOString().slice(0, 10)

  try {
    const auth = await exigirUsuario()
    if (!auth.ok) return auth.resp
    const caixas = await buscarCaixas({ empresaIds: grids, dataIni: dtInicio, dataFim: dtFim })
    const caixaGrids = caixas.map(c => c.grid as number)

    const caixaByGrid: Record<number, { empresa: number; data: string }> = {}
    for (const c of caixas) caixaByGrid[c.grid as number] = { empresa: c.empresa as number, data: c.data as string }

    const tefData = await buscarTefTransacoes(caixaGrids)

    const byEmpresa: Record<number, { transacoes: Set<number>; caixas: Set<number>; maxData: string }> = {}
    for (const t of tefData) {
      const c = caixaByGrid[t.caixa as number]
      if (!c) continue
      if (!byEmpresa[c.empresa]) byEmpresa[c.empresa] = { transacoes: new Set(), caixas: new Set(), maxData: '' }
      byEmpresa[c.empresa].transacoes.add(t.grid as number)
      byEmpresa[c.empresa].caixas.add(t.caixa as number)
      if ((t.data as string) > byEmpresa[c.empresa].maxData) byEmpresa[c.empresa].maxData = c.data
    }

    const resumo: TefEmpresaRow[] = grids.map(g => ({
      empresa_grid:     String(g),
      total_transacoes: byEmpresa[g]?.transacoes.size ?? 0,
      ultima_transacao: byEmpresa[g]?.maxData || null,
      total_caixas:     byEmpresa[g]?.caixas.size ?? 0,
    }))

    // Terminais TEF (empresa_tef)
    const pool = getPool()
    const client = await pool.connect()
    let tefTerminais: any[] = []
    try {
      await client.query("SET client_encoding = 'WIN1252'")
      const { rows } = await client.query(
        `SELECT empresa::bigint, codigo::text, nome::text, hospedado::boolean
         FROM empresa_tef WHERE empresa = ANY($1::bigint[]) ORDER BY empresa, codigo`,
        [grids],
      )
      tefTerminais = rows
    } finally {
      client.release()
      await pool.end()
    }

    const data: MaqTefRow[] = tefTerminais.map(t => ({
      empresa_grid: String(t.empresa),
      numero_serie: t.codigo,
      nome_tef:     t.nome ?? '',
      hospedado:    t.hospedado ?? false,
    }))

    return NextResponse.json({ data, resumo })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
