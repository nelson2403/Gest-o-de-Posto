import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Mapeamento: motivo_movto.grid → tipo interno
const MOTIVO_TIPO: Record<number, 'brinks' | 'cofre_pombal' | 'deposito_direto'> = {
  6706:     'deposito_direto',
  29771151: 'brinks',
  55142291: 'cofre_pombal',
}
const MOTIVOS_GRIDS = Object.keys(MOTIVO_TIPO).map(Number)

// POST /api/conferencia-caixa/sync
// Body: { data_ini: string, data_fim: string, posto_id?: string }
// 1. Busca no mirror (as_movto) todos os movtos de caixa pelos motivos mapeados
// 2. Upserta na tabela caixa_depositos
// 3. Tenta cruzar com extratos bancários já validados no Supabase
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()
  const { data_ini, data_fim, posto_id } = body as {
    data_ini: string; data_fim: string; posto_id?: string
  }

  if (!data_ini || !data_fim)
    return NextResponse.json({ error: 'data_ini e data_fim são obrigatórios' }, { status: 400 })

  const admin = createAdminClient()

  // Busca postos com código externo configurado
  let qPostos = admin
    .from('postos')
    .select('id, nome, empresa_id, codigo_empresa_externo')
    .not('codigo_empresa_externo', 'is', null)
  if (posto_id && posto_id !== 'todos') qPostos = qPostos.eq('id', posto_id)

  const { data: postos } = await qPostos
  if (!postos?.length) return NextResponse.json({ sincronizados: 0, postos: 0 })

  // Busca extratos bancários já validados no período (para cruzamento)
  const { data: extratos } = await admin
    .from('tarefas')
    .select(`
      id, extrato_data, extrato_periodo_ini, extrato_movimento,
      posto_id,
      recorrente:tarefas_recorrentes(posto_id)
    `)
    .eq('categoria', 'conciliacao_bancaria')
    .eq('extrato_status', 'ok')
    .gte('extrato_data', data_ini)
    .lte('extrato_data', data_fim)

  // Monta índice: posto_id → [{ data, movimento, tarefa_id }]
  type ExtratoIdx = { data: string; movimento: number; tarefa_id: string }
  const extratoIdx: Record<string, ExtratoIdx[]> = {}
  for (const t of extratos ?? []) {
    const pid = (t.posto_id as string | null) ??
      (t.recorrente as { posto_id: string | null } | null)?.posto_id ?? null
    if (!pid) continue
    if (!extratoIdx[pid]) extratoIdx[pid] = []
    extratoIdx[pid].push({
      data:      t.extrato_data as string,
      movimento: t.extrato_movimento as number,
      tarefa_id: t.id as string,
    })
  }

  // Busca motivo_nome para os grids fixos
  const { data: motivoNomesData } = await admin
    .from('as_motivo_movto')
    .select('grid, nome')
    .in('grid', MOTIVOS_GRIDS)
  const motivoNomeLookup: Record<number, string> = {}
  for (const m of motivoNomesData ?? []) motivoNomeLookup[m.grid] = m.nome ?? ''

  let sincronizados = 0

  for (const posto of postos) {
    const empresaGrid = parseInt(posto.codigo_empresa_externo)
    if (isNaN(empresaGrid)) continue

    // Busca movtos de caixa pelos motivos mapeados no mirror
    const { data: movtos } = await admin
      .from('as_movto')
      .select('data, motivo, valor')
      .eq('empresa', empresaGrid)
      .in('motivo', MOTIVOS_GRIDS)
      .gte('data', data_ini)
      .lte('data', data_fim)

    // Agrega por (data, motivo)
    const aggMap: Record<string, { data: string; motivo: number; total: number }> = {}
    for (const m of movtos ?? []) {
      if (!m.motivo) continue
      const key = `${m.data}|${m.motivo}`
      if (!aggMap[key]) aggMap[key] = { data: m.data, motivo: m.motivo, total: 0 }
      aggMap[key].total += m.valor ?? 0
    }

    for (const agg of Object.values(aggMap)) {
      const tipo = MOTIVO_TIPO[agg.motivo]
      if (!tipo) continue

      const valorAS      = parseFloat(agg.total.toFixed(2))
      const dataDeposito = agg.data

      // Tenta cruzar com extrato bancário (D+0 a D+2)
      let statusConc: 'pendente' | 'confirmado' | 'divergente' = 'pendente'
      let valorExtrato: number | null = null
      let dataExtrato:  string | null = null
      let tarefaId:     string | null = null

      const extratosPostos = extratoIdx[posto.id] ?? []
      const d0 = new Date(dataDeposito + 'T12:00:00')

      for (let i = 0; i <= 2; i++) {
        const dt    = new Date(d0)
        dt.setDate(dt.getDate() + i)
        const dtStr = dt.toISOString().split('T')[0]

        const match = extratosPostos.find(e => e.data === dtStr)
        if (match) {
          valorExtrato = match.movimento
          dataExtrato  = dtStr
          tarefaId     = match.tarefa_id
          const dif    = Math.abs(match.movimento - valorAS)
          statusConc   = dif <= 0.02 ? 'confirmado' : 'divergente'
          break
        }
      }

      // Upsert por (empresa_grid, data_deposito, motivo_grid)
      // Não sobrescreve ajuste_manual = true
      const { data: existing } = await admin
        .from('caixa_depositos')
        .select('id, ajuste_manual')
        .eq('empresa_grid', empresaGrid)
        .eq('data_deposito', dataDeposito)
        .eq('motivo_grid', agg.motivo)
        .maybeSingle()

      const payload = {
        empresa_id:       posto.empresa_id ?? null,
        posto_id:         posto.id,
        empresa_grid:     empresaGrid,
        data_deposito:    dataDeposito,
        tipo,
        motivo_grid:      agg.motivo,
        motivo_nome:      motivoNomeLookup[agg.motivo] ?? String(agg.motivo),
        valor_autosystem: valorAS,
        sincronizado_em:  new Date().toISOString(),
        sincronizado_por: user.id,
        ...(existing?.ajuste_manual ? {} : {
          status:        statusConc,
          valor_extrato: valorExtrato,
          data_extrato:  dataExtrato,
          tarefa_id:     tarefaId,
        }),
      }

      if (existing) {
        await admin.from('caixa_depositos').update(payload).eq('id', existing.id)
      } else {
        await admin.from('caixa_depositos').insert({
          ...payload,
          status:        statusConc,
          valor_extrato: valorExtrato,
          data_extrato:  dataExtrato,
          tarefa_id:     tarefaId,
        })
      }

      sincronizados++
    }
  }

  return NextResponse.json({
    ok: true,
    postos: postos.length,
    sincronizados,
  })
}
