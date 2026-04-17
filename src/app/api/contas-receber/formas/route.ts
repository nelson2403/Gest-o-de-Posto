import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/contas-receber/formas
// Returns summary grouped by conta_debitar + month.
// Payment rule: child = 0 → Em Aberto, child <> 0 → Baixado
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresaId = searchParams.get('empresa')
  const venctoIni = searchParams.get('vencto_ini')
  const venctoFim = searchParams.get('vencto_fim')

  const admin = createAdminClient()

  const { data: postos } = await admin
    .from('postos')
    .select('id, nome, codigo_empresa_externo')
    .not('codigo_empresa_externo', 'is', null)

  const postoMap: Record<string, string> = {}
  for (const p of postos ?? []) {
    if (p.codigo_empresa_externo) postoMap[p.codigo_empresa_externo] = p.nome
  }

  const empresaIds = (empresaId ? [empresaId] : Object.keys(postoMap)).map(Number)
  if (!empresaIds.length) return NextResponse.json({ resumo: [] })

  const venctoIniEfetivo = (!venctoIni || venctoIni < '2026-01-01') ? '2026-01-01' : venctoIni

  // Grupos de contas (inclui motivo:GRID keys)
  const { data: gruposData } = await admin.from('cr_contas_grupo').select('conta_debitar, grupo, conta_nome')
  const grupoMap: Record<string, string>                        = {}
  const motivoGrupos: Record<number, { grupo: string; nome: string }> = {}
  for (const g of gruposData ?? []) {
    grupoMap[g.conta_debitar] = g.grupo
    if (g.conta_debitar.startsWith('motivo:')) {
      const grid = parseInt(g.conta_debitar.replace('motivo:', ''))
      if (!isNaN(grid)) motivoGrupos[grid] = { grupo: g.grupo, nome: g.conta_nome ?? g.conta_debitar }
    }
  }

  // 1. Query as_movto — contas 1.3.%
  let q = admin
    .from('as_movto')
    .select('conta_debitar, empresa, pessoa, vencto, valor, child')
    .like('conta_debitar', '1.3.%')
    .in('empresa', empresaIds)
    .gte('vencto', venctoIniEfetivo)

  if (venctoFim) q = q.lte('vencto', venctoFim)

  const { data: movtos, error: errM } = await q
  if (errM) return NextResponse.json({ error: errM.message }, { status: 500 })

  // 2. Pessoas lookup
  const pessoaIds = [...new Set((movtos ?? []).map(m => m.pessoa).filter(Boolean))] as number[]
  const pessoaLookup: Record<number, string> = {}
  if (pessoaIds.length) {
    const { data: pessoas } = await admin.from('as_pessoa').select('grid, nome').in('grid', pessoaIds)
    for (const p of pessoas ?? []) pessoaLookup[p.grid] = p.nome ?? '(sem cliente)'
  }

  // 3. Contas lookup
  const { data: contasData } = await admin.from('as_conta').select('codigo, nome').like('codigo', '1.3.%')
  const contaLookup: Record<string, string> = {}
  for (const c of contasData ?? []) contaLookup[c.codigo] = c.nome ?? ''

  // 4. Agrega em JS: group by (conta_debitar, empresa, pessoa_nome, mes, pago)
  const agg: Record<string, {
    conta_debitar: string; conta_nome: string | null; empresa: string
    pessoa_nome: string; mes: string; pago: boolean; qtd: number; valor_total: number
  }> = {}

  for (const m of movtos ?? []) {
    const pessoa_nome  = m.pessoa ? (pessoaLookup[m.pessoa] ?? '(sem cliente)') : '(sem cliente)'
    const mes          = (m.vencto as string)?.slice(0, 7) ?? ''
    const pago         = m.child !== null && m.child !== 0
    const key          = `${m.conta_debitar}|${m.empresa}|${pessoa_nome}|${mes}|${pago}`
    if (!agg[key]) agg[key] = {
      conta_debitar: m.conta_debitar ?? '',
      conta_nome:    contaLookup[m.conta_debitar ?? ''] ?? null,
      empresa:       String(m.empresa),
      pessoa_nome,
      mes,
      pago,
      qtd:         0,
      valor_total: 0,
    }
    agg[key].qtd         += 1
    agg[key].valor_total += m.valor ?? 0
  }

  const rows = Object.values(agg).map(r => ({
    ...r,
    posto_nome: postoMap[r.empresa] ?? r.empresa,
    grupo:      grupoMap[r.conta_debitar] ?? null,
  }))

  // 5. Motivo-based movements (SANGRIA, BRINKS, COFRE etc.)
  const motivoGrids = Object.keys(motivoGrupos).map(Number)
  let motivoRows: typeof rows = []

  if (motivoGrids.length > 0) {
    let qm = admin
      .from('as_movto')
      .select('motivo, empresa, data, child, valor')
      .in('empresa', empresaIds)
      .in('motivo', motivoGrids)
      .gte('data', venctoIniEfetivo)

    if (venctoFim) qm = qm.lte('data', venctoFim)

    const { data: motivoMovtos } = await qm

    // Motivo names lookup
    const { data: motivoNomes } = await admin.from('as_motivo_movto').select('grid, nome').in('grid', motivoGrids)
    const motivoNomeLookup: Record<number, string> = {}
    for (const mn of motivoNomes ?? []) motivoNomeLookup[mn.grid] = mn.nome ?? ''

    const aggM: Record<string, { motivo: number; empresa: string; mes: string; pago: boolean; qtd: number; valor_total: number }> = {}
    for (const m of motivoMovtos ?? []) {
      const mes  = (m.data as string)?.slice(0, 7) ?? ''
      const pago = m.child !== null && m.child !== 0
      const key  = `${m.motivo}|${m.empresa}|${mes}|${pago}`
      if (!aggM[key]) aggM[key] = { motivo: m.motivo, empresa: String(m.empresa), mes, pago, qtd: 0, valor_total: 0 }
      aggM[key].qtd         += 1
      aggM[key].valor_total += m.valor ?? 0
    }

    motivoRows = Object.values(aggM).map(r => {
      const mg = motivoGrupos[r.motivo]
      return {
        conta_debitar: `motivo:${r.motivo}`,
        conta_nome:    mg?.nome ?? motivoNomeLookup[r.motivo] ?? String(r.motivo),
        empresa:       r.empresa,
        pessoa_nome:   '—',
        mes:           r.mes,
        pago:          r.pago,
        qtd:           r.qtd,
        valor_total:   r.valor_total,
        posto_nome:    postoMap[r.empresa] ?? r.empresa,
        grupo:         mg?.grupo ?? null,
      }
    })
  }

  return NextResponse.json({ resumo: [...rows, ...motivoRows] })
}
