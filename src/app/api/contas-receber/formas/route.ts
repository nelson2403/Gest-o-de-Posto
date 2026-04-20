import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buscarMovtosFormas, buscarMovtosMotivoFormas, buscarPessoas, buscarContas, buscarMotivos } from '@/lib/autosystem'

export async function GET(req: NextRequest) {
  try {
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

  const { data: gruposData } = await admin.from('cr_contas_grupo').select('conta_debitar, grupo, conta_nome')
  const grupoMap: Record<string, string> = {}
  const motivoGrupos: Record<number, { grupo: string; nome: string }> = {}
  for (const g of gruposData ?? []) {
    grupoMap[g.conta_debitar] = g.grupo
    if (g.conta_debitar.startsWith('motivo:')) {
      const grid = parseInt(g.conta_debitar.replace('motivo:', ''))
      if (!isNaN(grid)) motivoGrupos[grid] = { grupo: g.grupo, nome: g.conta_nome ?? g.conta_debitar }
    }
  }

  const movtosRaw = await buscarMovtosFormas(empresaIds, { venctoIni: venctoIniEfetivo, venctoFim })

  const pessoaIds = [...new Set((movtosRaw as any[]).map(m => m.pessoa).filter(Boolean))] as number[]
  const pessoaLookup: Record<number, string> = {}
  if (pessoaIds.length) {
    const pessoas = await buscarPessoas(pessoaIds)
    for (const p of pessoas) pessoaLookup[p.grid] = p.nome ?? '(sem cliente)'
  }

  const contasData = await buscarContas('1.3.%')
  const contaLookup: Record<string, string> = {}
  for (const c of contasData) contaLookup[c.codigo] = c.nome ?? ''

  const agg: Record<string, {
    conta_debitar: string; conta_nome: string | null; empresa: string
    pessoa_nome: string; mes: string; pago: boolean; qtd: number; valor_total: number
  }> = {}

  for (const m of movtosRaw as any[]) {
    const pessoa_nome = m.pessoa ? (pessoaLookup[m.pessoa] ?? '(sem cliente)') : '(sem cliente)'
    const mes         = (m.vencto as string)?.slice(0, 7) ?? ''
    const pago        = (m.child as number) > 0
    const key         = `${m.conta_debitar}|${m.empresa}|${pessoa_nome}|${mes}|${pago}`
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

  const motivoGrids = Object.keys(motivoGrupos).map(Number)
  let motivoRows: typeof rows = []

  if (motivoGrids.length > 0) {
    const motivoMovtos = await buscarMovtosMotivoFormas(empresaIds, motivoGrids, { dataIni: venctoIniEfetivo, dataFim: venctoFim })
    const motivoNomes = await buscarMotivos(motivoGrids)
    const motivoNomeLookup: Record<number, string> = {}
    for (const mn of motivoNomes) motivoNomeLookup[mn.grid] = mn.nome ?? ''

    const aggM: Record<string, { motivo: number; empresa: string; mes: string; pago: boolean; qtd: number; valor_total: number }> = {}
    for (const m of motivoMovtos as any[]) {
      const mes  = (m.data as string)?.slice(0, 7) ?? ''
      const pago = (m.child as number) > 0
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
  } catch (err: any) {
    console.error('[contas-receber/formas]', err)
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 })
  }
}
