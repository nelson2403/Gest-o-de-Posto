import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buscarVendasCombustiveisPorMes } from '@/lib/autosystem'

export const dynamic = 'force-dynamic'

// GET /api/analise-vendas/combustiveis-historico
//   ?empresaIds=1,2,3
//   &dataIni=YYYY-MM-DD
//   &dataFim=YYYY-MM-DD
//   &produtoId=NNN   (opcional)
//
// Retorna { porMes: [{ mes: 'YYYY-MM', litros, venda, custo }] }
// com até 12 meses do histórico de combustíveis (produto.tipo = 'C').
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresaIdsRaw = searchParams.get('empresaIds') ?? ''
  const dataIni       = searchParams.get('dataIni') ?? ''
  const dataFim       = searchParams.get('dataFim') ?? ''
  const produtoIdRaw  = searchParams.get('produtoId') ?? ''

  if (!empresaIdsRaw || !dataIni || !dataFim) {
    return NextResponse.json({ error: 'Parâmetros ausentes' }, { status: 400 })
  }

  const empresaIds = empresaIdsRaw.split(',').map(Number).filter(n => !isNaN(n) && n > 0)
  if (!empresaIds.length) return NextResponse.json({ error: 'Nenhuma empresa' }, { status: 400 })

  const produtoId = produtoIdRaw ? Number(produtoIdRaw) : undefined
  if (produtoId !== undefined && (isNaN(produtoId) || produtoId <= 0)) {
    return NextResponse.json({ error: 'produtoId inválido' }, { status: 400 })
  }

  try {
    const porMes = await buscarVendasCombustiveisPorMes(empresaIds, dataIni, dataFim, produtoId)
    return NextResponse.json({ porMes })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao consultar AUTOSYSTEM'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
