import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { searchParams } = new URL(req.url)
  const dias = Math.min(30, parseInt(searchParams.get('dias') ?? '14', 10))

  const { data: usuarioRow } = await admin
    .from('usuarios').select('role, posto_fechamento_id').eq('id', user.id).single()
  const userRole = usuarioRow?.role ?? ''

  const today = new Date()
  const dataList: string[] = []
  for (let i = 0; i < dias; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    dataList.push(d.toISOString().slice(0, 10))
  }
  const dataIni = dataList[dataList.length - 1]
  const dataFim = dataList[0]

  let qTanques = admin.from('tanques_postos').select('id, posto_nome').eq('ativo', true)

  let qMed = admin
    .from('medicoes_tanques')
    .select('tanque_id, posto_nome, data, medida_litros, criado_em')
    .gte('data', dataIni)
    .lte('data', dataFim)

  if (userRole === 'gerente' && usuarioRow?.posto_fechamento_id) {
    const { data: porId } = await admin
      .from('tanques_postos').select('id, posto_nome')
      .eq('ativo', true).eq('posto_id', usuarioRow.posto_fechamento_id)

    if (porId && porId.length > 0) {
      const postoNome = porId[0].posto_nome
      qTanques = admin.from('tanques_postos').select('id, posto_nome')
        .eq('ativo', true).eq('posto_nome', postoNome)
      qMed = qMed.eq('posto_nome', postoNome)
    }
  }

  const [{ data: tanques }, { data: medicoes }] = await Promise.all([qTanques, qMed])

  const totalPorPosto: Record<string, number> = {}
  for (const t of tanques ?? []) {
    totalPorPosto[t.posto_nome] = (totalPorPosto[t.posto_nome] ?? 0) + 1
  }

  // Agrupa por posto+data, guardando o criado_em mais recente do grupo
  type DiaInfo = { preenchidos: number; total: number; criado_em?: string }
  const porPosto: Record<string, Record<string, DiaInfo>> = {}

  for (const m of medicoes ?? []) {
    if (!porPosto[m.posto_nome]) porPosto[m.posto_nome] = {}
    const key = m.data as string
    if (!porPosto[m.posto_nome][key]) {
      porPosto[m.posto_nome][key] = { preenchidos: 0, total: totalPorPosto[m.posto_nome] ?? 0 }
    }
    const entry = porPosto[m.posto_nome][key]
    if (m.medida_litros !== null) entry.preenchidos++
    // Guarda o criado_em mais recente do grupo
    if (m.criado_em && (!entry.criado_em || m.criado_em > entry.criado_em)) {
      entry.criado_em = m.criado_em
    }
  }

  for (const posto of Object.keys(totalPorPosto)) {
    if (!porPosto[posto]) porPosto[posto] = {}
    for (const d of dataList) {
      if (!porPosto[posto][d]) {
        porPosto[posto][d] = { preenchidos: 0, total: totalPorPosto[posto] }
      }
    }
  }

  return NextResponse.json({ dias: dataList, porPosto, totalPorPosto })
}
