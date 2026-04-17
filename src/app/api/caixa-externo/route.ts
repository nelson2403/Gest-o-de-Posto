import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface CaixaExternoRow {
  grid: string
  codigo: string
  nome: string
  ultimo_caixa_fechado: string | null
}

export async function GET() {
  try {
    const admin = createAdminClient()

    // 1. Todas as empresas
    const { data: empresas, error: errE } = await admin
      .from('as_empresa')
      .select('grid, codigo, nome')

    if (errE) return NextResponse.json({ error: errE.message }, { status: 500 })

    // 2. Último caixa fechado (conferencia IS NOT NULL) por empresa
    const { data: caixas, error: errC } = await admin
      .from('as_caixa')
      .select('empresa, data')
      .not('conferencia', 'is', null)
      .order('data', { ascending: false })

    if (errC) return NextResponse.json({ error: errC.message }, { status: 500 })

    // Max data por empresa
    const maxDataByEmpresa: Record<string, string> = {}
    for (const c of caixas ?? []) {
      const emp = String(c.empresa)
      if (!maxDataByEmpresa[emp] || c.data > maxDataByEmpresa[emp]) {
        maxDataByEmpresa[emp] = c.data
      }
    }

    const rows: CaixaExternoRow[] = (empresas ?? []).map(e => ({
      grid:                 String(e.grid),
      codigo:               e.codigo ?? '',
      nome:                 e.nome   ?? '',
      ultimo_caixa_fechado: maxDataByEmpresa[String(e.grid)] ?? null,
    })).sort((a, b) => a.nome.localeCompare(b.nome))

    return NextResponse.json({ data: rows })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[caixa-externo]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
