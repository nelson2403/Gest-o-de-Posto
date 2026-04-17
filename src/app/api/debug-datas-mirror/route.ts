import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/debug-datas-mirror
// Mostra quais datas existem no mirror para uma empresa específica (empresa 9868983)
// para identificar se o formato de data está errado
export async function GET() {
  const admin = createAdminClient()

  // Pega as últimas 20 datas distintas para empresa 9868983 (SETE IRMAOS)
  const { data: datas, error } = await admin
    .from('as_movto')
    .select('data')
    .eq('empresa', 9868983)
    .order('data', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message })

  const distintas = [...new Set((datas ?? []).map((r: any) => r.data))].slice(0, 30)

  // Também verifica empresa 1 (PEDRA DO POMBAL)
  const { data: datas2 } = await admin
    .from('as_movto')
    .select('data')
    .eq('empresa', 1)
    .order('data', { ascending: false })
    .limit(100)

  const distintas2 = [...new Set((datas2 ?? []).map((r: any) => r.data))].slice(0, 30)

  // Conta total para cada empresa com problema
  const empresas = [9868983, 9882806, 9889093, 15613912, 1]
  const contagens: any[] = []
  for (const emp of empresas) {
    const { count } = await admin
      .from('as_movto')
      .select('*', { count: 'exact', head: true })
      .eq('empresa', emp)
      .gte('data', '2026-04-01')
      .lte('data', '2026-04-01')

    const { count: countTotal } = await admin
      .from('as_movto')
      .select('*', { count: 'exact', head: true })
      .eq('empresa', emp)

    contagens.push({ empresa: emp, registros_em_2026_04_01: count, total_no_mirror: countTotal })
  }

  return NextResponse.json({
    sete_irmaos_9868983: {
      datas_distintas_recentes: distintas,
    },
    pedra_do_pombal_1: {
      datas_distintas_recentes: distintas2,
    },
    contagens_por_empresa: contagens,
  })
}
