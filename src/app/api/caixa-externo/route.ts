import { NextResponse } from 'next/server'
import { buscarEmpresas, buscarCaixas } from '@/lib/autosystem'
import { exigirUsuario } from "@/lib/auth-guard"

export interface CaixaExternoRow {
  grid: string
  codigo: string
  nome: string
  ultimo_caixa_fechado: string | null
}

export async function GET() {
  try {
    const auth = await exigirUsuario()
    if (!auth.ok) return auth.resp
    const [empresas, caixas] = await Promise.all([
      buscarEmpresas(),
      buscarCaixas({ soFechados: true }),
    ])

    const maxDataByEmpresa: Record<string, string> = {}
    for (const c of caixas) {
      const emp = String(c.empresa)
      const data = c.data as string
      if (!maxDataByEmpresa[emp] || data > maxDataByEmpresa[emp]) {
        maxDataByEmpresa[emp] = data
      }
    }

    const rows: CaixaExternoRow[] = empresas.map(e => ({
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
