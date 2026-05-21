import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buscarVendasCombustivel } from '@/lib/autosystem'

export const dynamic = 'force-dynamic'

// GET /api/tanques/vendas-combustivel?postoNome=FORTALEZA&data=2026-05-21
// Retorna vendas em litros do dia anterior + medição anterior, por produto
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const postoNome = searchParams.get('postoNome')?.trim()
  const data      = searchParams.get('data')?.trim()  // data que o gerente está medindo (YYYY-MM-DD)

  if (!postoNome || !data) {
    return NextResponse.json({ error: 'Parâmetros ausentes' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Data do dia anterior (referência para comparar)
  const diaAnterior = new Date(data + 'T12:00:00')
  diaAnterior.setDate(diaAnterior.getDate() - 1)
  const dataAnterior = diaAnterior.toISOString().slice(0, 10)

  // Busca todos os tanques do posto
  const { data: tanques } = await admin
    .from('tanques_postos')
    .select('id, produto, posto_id')
    .ilike('posto_nome', postoNome)
    .eq('ativo', true)

  const tanqueIds = (tanques ?? []).map(t => t.id)
  const postoId   = tanques?.find(t => t.posto_id)?.posto_id ?? null

  // Medição do dia anterior para cada tanque
  const { data: medAnt } = tanqueIds.length
    ? await admin
        .from('medicoes_tanques')
        .select('tanque_id, medida_litros')
        .in('tanque_id', tanqueIds)
        .eq('data', dataAnterior)
    : { data: [] }

  const medAnteriorMap: Record<string, number | null> = {}
  for (const m of medAnt ?? []) medAnteriorMap[m.tanque_id] = m.medida_litros

  const medidasAnteriores = (tanques ?? []).map(t => ({
    tanque_id:       t.id,
    produto:         t.produto,
    medida_anterior: medAnteriorMap[t.id] ?? null,
    data_anterior:   dataAnterior,
  }))

  // Vendas AUTOSYSTEM do dia anterior (dados completos)
  let vendas: { produto: string; litros: number; grupo_nome: string }[] = []

  if (postoId) {
    const { data: posto } = await admin
      .from('postos')
      .select('codigo_empresa_externo')
      .eq('id', postoId)
      .single()

    const empresaId = posto?.codigo_empresa_externo ? Number(posto.codigo_empresa_externo) : null

    if (empresaId && !isNaN(empresaId)) {
      try {
        vendas = await buscarVendasCombustivel(empresaId, dataAnterior)
      } catch {
        // AUTOSYSTEM inacessível — continua sem dados de vendas
      }
    }
  }

  return NextResponse.json({
    data_referencia: dataAnterior,
    medidasAnteriores,
    vendas,
  })
}
