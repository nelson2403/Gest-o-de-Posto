import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/marketing/diagnostico
// Investiga a estrutura da tabela movto e lista valores distintos de motivo
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()

  // Busca motivos marketing/patroc
  const { data: motivoNomes, error: errMM } = await admin
    .from('as_motivo_movto')
    .select('grid, nome')

  if (errMM) return NextResponse.json({ error: errMM.message }, { status: 500 })

  const motivosFiltrados = (motivoNomes ?? []).filter(m =>
    m.nome?.toLowerCase().includes('marketing') || m.nome?.toLowerCase().includes('patroc')
  )

  if (!motivosFiltrados.length) return NextResponse.json({ motivos: [] })

  const motivoGrids = motivosFiltrados.map(m => m.grid)

  // Conta movimentos e soma valores por motivo
  const { data: movtos } = await admin
    .from('as_movto')
    .select('motivo, valor')
    .in('motivo', motivoGrids)

  const agg: Record<number, { qtd: number; valor: number }> = {}
  for (const m of movtos ?? []) {
    if (!m.motivo) continue
    if (!agg[m.motivo]) agg[m.motivo] = { qtd: 0, valor: 0 }
    agg[m.motivo].qtd   += 1
    agg[m.motivo].valor += m.valor ?? 0
  }

  const motivos = motivosFiltrados.map(m => ({
    grid:        m.grid,
    nome:        m.nome,
    qtd_movtos:  agg[m.grid]?.qtd   ?? 0,
    valor_total: parseFloat((agg[m.grid]?.valor ?? 0).toFixed(2)),
  })).sort((a, b) => b.qtd_movtos - a.qtd_movtos)

  return NextResponse.json({ motivos })
}
