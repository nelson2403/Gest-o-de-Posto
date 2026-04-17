import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import * as XLSX from 'xlsx'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseValorBRSigned(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return 0
  if (typeof raw === 'number') return raw
  const str = String(raw).trim()
  const sufixoD = /\s*[Dd]\s*$/.test(str)
  const semSufixo = str.replace(/\s*[CDcd*]\s*$/, '').trim()
  const negativo = sufixoD || semSufixo.startsWith('-')
  const semSinal = semSufixo.replace(/^-\s*/, '').trim()
  const norm = semSinal.replace(/\./g, '').replace(',', '.')
  const num  = parseFloat(norm)
  if (isNaN(num)) return 0
  return negativo ? -num : num
}

function parseDataExcel(raw: unknown): string | null {
  if (!raw) return null
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const str = String(raw).trim()
  const partes = str.split('/')
  if (partes.length === 3)
    return `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  return null
}

// ─── POST /api/tarefas/extrato-multi ─────────────────────────────────────────
// Body: FormData { file: File, posto_id: string }
// Processa um extrato Excel com múltiplos dias e valida uma tarefa por dia.
export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const formData = await req.formData()
  const file    = formData.get('file') as File | null
  const postoId = formData.get('posto_id') as string | null

  if (!file)    return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })
  if (!postoId) return NextResponse.json({ error: 'posto_id é obrigatório' }, { status: 400 })

  // ── Parse Excel ────────────────────────────────────────────────────────────
  const buffer = await file.arrayBuffer()
  const wb     = XLSX.read(buffer, { type: 'array', cellDates: false })
  const ws     = wb.Sheets[wb.SheetNames[0]]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  const saldosDia: Array<{ data: string; valor: number }> = []
  let saldoAnterior: number | null = null

  for (const row of rows) {
    const colC = String(row[2] ?? '').trim().toUpperCase()
    if (colC === 'SALDO DO DIA') {
      const d = parseDataExcel(row[0])
      if (d) saldosDia.push({ data: d, valor: parseValorBRSigned(row[3]) })
    }
    if (colC === 'SALDO ANTERIOR' && saldoAnterior === null) {
      saldoAnterior = parseValorBRSigned(row[3])
    }
  }

  if (saldosDia.length === 0 || saldoAnterior === null) {
    return NextResponse.json({
      error: 'Não foram encontradas as linhas "SALDO DO DIA" e "SALDO ANTERIOR". Verifique se o arquivo é o extrato correto.',
    }, { status: 422 })
  }

  if (saldosDia.length === 1) {
    return NextResponse.json({
      error: 'Este extrato contém apenas 1 dia. Use o botão "Extrato" na tarefa individual.',
    }, { status: 422 })
  }

  saldosDia.sort((a, b) => a.data.localeCompare(b.data))

  const periodoIni = saldosDia[0].data
  const periodoFim = saldosDia[saldosDia.length - 1].data

  const diasMovimentos = saldosDia.map((s, i) => {
    const saldoPrev = i === 0 ? saldoAnterior! : saldosDia[i - 1].valor
    return {
      data:          s.data,
      saldoDia:      s.valor,
      saldoAnterior: saldoPrev,
      movimento:     parseFloat((s.valor - saldoPrev).toFixed(2)),
    }
  })

  const admin = createAdminClient()

  // ── Resolve posto → empresa externo ───────────────────────────────────────
  const { data: posto } = await admin
    .from('postos')
    .select('id, nome, codigo_empresa_externo')
    .eq('id', postoId)
    .single()

  if (!posto?.codigo_empresa_externo)
    return NextResponse.json({ error: 'Posto sem código externo configurado' }, { status: 400 })

  const empresaId = parseInt(posto.codigo_empresa_externo)

  // Busca conta bancária do posto
  const { data: contasMapeadas } = await admin
    .from('contas_bancarias')
    .select('codigo_conta_externo')
    .eq('posto_id', postoId)
    .not('codigo_conta_externo', 'is', null)
    .limit(1)
  const contaCodigo: string | null = (contasMapeadas?.[0] as any)?.codigo_conta_externo ?? null

  // ── Busca todas as tarefas de conciliação do posto no período ──────────────
  const { data: tarefasDiretas } = await admin
    .from('tarefas')
    .select('id, status, data_conclusao_prevista, posto_id, tarefa_recorrente_id')
    .eq('categoria', 'conciliacao_bancaria')
    .eq('posto_id', postoId)
    .gte('data_conclusao_prevista', periodoIni)
    .lte('data_conclusao_prevista', periodoFim)
    .neq('status', 'cancelado')

  const { data: tarefasRecorrentes } = await admin
    .from('tarefas')
    .select('id, status, data_conclusao_prevista, posto_id, tarefa_recorrente_id, recorrente:tarefas_recorrentes(posto_id)')
    .eq('categoria', 'conciliacao_bancaria')
    .is('posto_id', null)
    .gte('data_conclusao_prevista', periodoIni)
    .lte('data_conclusao_prevista', periodoFim)
    .neq('status', 'cancelado')

  const tarefasRecorrentesFiltradas = (tarefasRecorrentes ?? []).filter(
    t => (t.recorrente as any)?.posto_id === postoId
  )

  const tarefaMap = new Map<string, any>()
  for (const t of [...(tarefasDiretas ?? []), ...tarefasRecorrentesFiltradas]) {
    if (t.data_conclusao_prevista) tarefaMap.set(t.data_conclusao_prevista, t)
  }

  // ── Busca movimentos do período no mirror ──────────────────────────────────
  const todasDatas = diasMovimentos.map(d => d.data)
  const { data: movtos } = await admin
    .from('as_movto')
    .select('conta_debitar, conta_creditar, valor, data')
    .eq('empresa', empresaId)
    .in('data', todasDatas)

  // ── Processa cada dia ──────────────────────────────────────────────────────
  const resultados: Array<{
    data: string; tarefaId: string | null; status: 'ok' | 'divergente' | 'sem_tarefa'
    movimentoExtrato: number; movimentoAS: number; diferenca: number
  }> = []

  for (const dia of diasMovimentos) {
    const movtosDia = (movtos ?? []).filter(m => m.data === dia.data)

    let movAS = 0
    if (contaCodigo) {
      const debito  = movtosDia.filter(m => m.conta_debitar  === contaCodigo).reduce((s, m) => s + (m.valor ?? 0), 0)
      const credito = movtosDia.filter(m => m.conta_creditar === contaCodigo).reduce((s, m) => s + (m.valor ?? 0), 0)
      movAS = parseFloat((debito - credito).toFixed(2))
    } else {
      const debito  = movtosDia.filter(m => m.conta_debitar?.startsWith('1.2.')  && !m.conta_creditar?.startsWith('1.2.')).reduce((s, m) => s + (m.valor ?? 0), 0)
      const credito = movtosDia.filter(m => m.conta_creditar?.startsWith('1.2.') && !m.conta_debitar?.startsWith('1.2.')).reduce((s, m) => s + (m.valor ?? 0), 0)
      movAS = parseFloat((debito - credito).toFixed(2))
    }

    const diferenca = parseFloat((dia.movimento - movAS).toFixed(2))
    const statusDia = Math.abs(diferenca) < 0.02 ? 'ok' : 'divergente'

    const tarefa = tarefaMap.get(dia.data) ?? null

    if (!tarefa) {
      resultados.push({ data: dia.data, tarefaId: null, status: 'sem_tarefa', movimentoExtrato: dia.movimento, movimentoAS: movAS, diferenca })
      continue
    }

    // Upload do arquivo
    const nomeArquivo = `${tarefa.id}/${dia.data}_multi_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    await (await createServerClient()).storage
      .from('extratos-bancarios')
      .upload(nomeArquivo, buffer, { contentType: file.type, upsert: true })

    const updates: Record<string, unknown> = {
      extrato_arquivo_path:   nomeArquivo,
      extrato_arquivo_nome:   file.name,
      extrato_data:           dia.data,
      extrato_periodo_ini:    periodoIni,
      extrato_saldo_dia:      dia.saldoDia,
      extrato_saldo_anterior: dia.saldoAnterior,
      extrato_movimento:      dia.movimento,
      extrato_saldo_externo:  movAS,
      extrato_diferenca:      diferenca,
      extrato_status:         statusDia,
      extrato_validado_em:    new Date().toISOString(),
    }

    if (statusDia === 'ok' && tarefa.status !== 'concluido') {
      updates.status              = 'concluido'
      updates.data_conclusao_real = new Date().toISOString()
    }

    await admin.from('tarefas').update(updates).eq('id', tarefa.id)

    resultados.push({ data: dia.data, tarefaId: tarefa.id, status: statusDia, movimentoExtrato: dia.movimento, movimentoAS: movAS, diferenca })
  }

  const ok         = resultados.filter(r => r.status === 'ok').length
  const divergente = resultados.filter(r => r.status === 'divergente').length
  const semTarefa  = resultados.filter(r => r.status === 'sem_tarefa').length

  return NextResponse.json({
    ok: true,
    periodoIni,
    periodoFim,
    dias:             diasMovimentos.length,
    empresaGrid:      String(empresaId),
    contaCodigo,
    resultados,
    ok_count:         ok,
    divergente_count: divergente,
    sem_tarefa_count: semTarefa,
  })
}
