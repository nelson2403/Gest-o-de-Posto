import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buscarMovtosAutosystem, calcularMovimento, buscarMovimentoContaGrupo } from '@/lib/autosystem'
import { datasConciliacao, intervaloDatas } from '@/lib/feriados'
import * as XLSX from 'xlsx'

// ─── Converte valor BR do Excel preservando o sinal ──────────────────────────
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

// ─── Converte data do Excel para string ISO (YYYY-MM-DD) ──────────────────────
function parseDataExcel(raw: unknown): string | null {
  if (!raw) return null
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const str    = String(raw).trim()
  const partes = str.split('/')
  if (partes.length === 3)
    return `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  return null
}

// ─── Converte "DD/MM/YYYY HH:MM" (Stone) para ISO ────────────────────────────
function parseDataStone(raw: unknown): string | null {
  const [datePart] = String(raw ?? '').trim().split(' ')
  const parts = (datePart ?? '').split('/')
  if (parts.length !== 3) return null
  const [d, m, y] = parts
  if (!d || !m || !y || y.length !== 4) return null
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

// ─── POST /api/tarefas/[id]/extrato ──────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // ── Busca tarefa com posto e data esperada ────────────────────────────────
  const { data: tarefa } = await supabase
    .from('tarefas')
    .select(`
      id, status, categoria, posto_id, tarefa_recorrente_id,
      data_conclusao_prevista,
      posto:postos(id, nome, codigo_empresa_externo),
      recorrente:tarefas_recorrentes(posto_id, conta_bancaria_id, posto:postos(id, nome, codigo_empresa_externo))
    `)
    .eq('id', id)
    .single()

  if (!tarefa) return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })
  if (tarefa.categoria !== 'conciliacao_bancaria')
    return NextResponse.json({ error: 'Esta tarefa não é de conciliação bancária' }, { status: 400 })

  type PostoInfo = { id: string; nome: string; codigo_empresa_externo: string | null }
  const recorrente = tarefa.recorrente as unknown as {
    posto_id: string | null
    conta_bancaria_id: string | null
    posto: PostoInfo | null
  } | null
  const postoResolvido: PostoInfo | null =
    (tarefa.posto as unknown as PostoInfo | null) ??
    recorrente?.posto ??
    null

  const postoId: string | null =
    (tarefa.posto_id as string | null) ??
    (recorrente?.posto_id ?? null) ??
    postoResolvido?.id ??
    null

  const contaBancariaId: string | null = recorrente?.conta_bancaria_id ?? null

  // Data esperada da tarefa (YYYY-MM-DD)
  const dataEsperada: string | null = (tarefa.data_conclusao_prevista as string | null)?.slice(0, 10) ?? null

  // ── Lê o arquivo (Excel ou CSV) ───────────────────────────────────────────
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const wb     = XLSX.read(buffer, { type: 'array', cellDates: false })
  const ws     = wb.Sheets[wb.SheetNames[0]]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  // ── Detecta formato: Stone (CSV) ou Sicoob (Excel) ────────────────────────
  const isStone = rows.some(row => /^(Débito|Crédito)$/i.test(String(row[0] ?? '').trim()))

  let extratoData = ''
  let saldoDia    = 0
  let saldoAnterior = 0
  let movimentoExtrato = 0
  let datasAS: string[] = []

  if (isStone) {
    // ── Parser Stone CSV ──────────────────────────────────────────────────
    // Colunas: Tipo | Categoria | Valor | Saldo Devedor | Saldo Credor | Tarifa | Data/Hora | Status | ...
    const dataRows = rows.filter(row => /^(Débito|Crédito)$/i.test(String(row[0] ?? '').trim()))
    const datasNoArquivo = [...new Set(
      dataRows.map(r => parseDataStone(r[6])).filter((d): d is string => d !== null)
    )]

    let targetDate: string
    if (dataEsperada) {
      if (!datasNoArquivo.includes(dataEsperada)) {
        const lista = datasNoArquivo.map(s => s.split('-').reverse().join('/')).join(', ')
        return NextResponse.json({
          error: `O extrato Stone não contém a data ${dataEsperada.split('-').reverse().join('/')} (data desta tarefa). Datas encontradas: ${lista || 'nenhuma'}.`,
        }, { status: 422 })
      }
      targetDate = dataEsperada
    } else {
      const sorted = datasNoArquivo.slice().sort()
      targetDate = sorted[sorted.length - 1] ?? ''
      if (!targetDate) return NextResponse.json({ error: 'Extrato Stone vazio ou inválido.' }, { status: 422 })
    }

    // Feriado/fim de semana: o banco liquida no próximo dia útil. Agregamos o
    // dia-alvo + os dias não-úteis anteriores QUE EXISTEM no arquivo, somando o
    // movimento dos dois lados (extrato e AUTOSYSTEM) no mesmo intervalo.
    const datasAgregadas = datasConciliacao(targetDate)
      .filter(d => d === targetDate || datasNoArquivo.includes(d))

    const rowsForDate = dataRows.filter(r => {
      const d = parseDataStone(r[6])
      return d !== null && datasAgregadas.includes(d)
    })
    const rowsTargetDate = dataRows.filter(r => parseDataStone(r[6]) === targetDate)

    movimentoExtrato = parseFloat(
      rowsForDate.reduce((sum, r) => sum + parseValorBRSigned(r[2]), 0).toFixed(2)
    )

    const lastRow   = rowsTargetDate[rowsTargetDate.length - 1]
    const credorFim  = parseValorBRSigned(lastRow[4])
    const devedorFim = parseValorBRSigned(lastRow[3])
    saldoDia      = parseFloat((credorFim - devedorFim).toFixed(2))
    saldoAnterior = parseFloat((saldoDia - movimentoExtrato).toFixed(2))
    extratoData   = targetDate
    datasAS       = datasAgregadas

  } else {
    // ── Parser Sicoob Excel ───────────────────────────────────────────────
    const saldosDia: Array<{ data: string; valor: number }> = []
    let saldoAnteriorArquivo: number | null = null

    for (const row of rows) {
      const colC = String(row[2] ?? '').trim().toUpperCase()
      if (colC === 'SALDO DO DIA') {
        const d = parseDataExcel(row[0])
        if (d) saldosDia.push({ data: d, valor: parseValorBRSigned(row[3]) })
      }
      if (colC === 'SALDO ANTERIOR' && saldoAnteriorArquivo === null) {
        saldoAnteriorArquivo = parseValorBRSigned(row[3])
      }
    }

    if (saldosDia.length === 0 || saldoAnteriorArquivo === null) {
      return NextResponse.json({
        error: 'Não foram encontradas as linhas "SALDO DO DIA" e "SALDO ANTERIOR". Verifique se o arquivo é o extrato correto.',
      }, { status: 422 })
    }

    saldosDia.sort((a, b) => a.data.localeCompare(b.data))

    if (dataEsperada) {
      const idx = saldosDia.findIndex(s => s.data === dataEsperada)
      if (idx === -1) {
        const datas = saldosDia.map(s => s.data.split('-').reverse().join('/')).join(', ')
        return NextResponse.json({
          error: `O extrato não contém a data ${dataEsperada.split('-').reverse().join('/')} (data desta tarefa). Datas encontradas: ${datas}. Verifique se está enviando o extrato correto.`,
        }, { status: 422 })
      }
      extratoData   = dataEsperada
      saldoDia      = saldosDia[idx].valor
      saldoAnterior = idx > 0 ? saldosDia[idx - 1].valor : saldoAnteriorArquivo
      // O movimento (saldoDia − saldoAnterior) cobre o intervalo entre o saldo
      // anterior e este dia — inclui feriados/fins de semana sem linha de saldo.
      datasAS       = idx > 0 ? intervaloDatas(saldosDia[idx - 1].data, extratoData) : datasConciliacao(extratoData)
    } else {
      const last    = saldosDia[saldosDia.length - 1]
      extratoData   = last.data
      saldoDia      = last.valor
      saldoAnterior = saldosDia.length > 1 ? saldosDia[saldosDia.length - 2].valor : saldoAnteriorArquivo
      datasAS       = saldosDia.length > 1 ? intervaloDatas(saldosDia[saldosDia.length - 2].data, extratoData) : datasConciliacao(extratoData)
    }

    movimentoExtrato = parseFloat((saldoDia - saldoAnterior).toFixed(2))
  }

  // ── Busca código da conta no AUTOSYSTEM ───────────────────────────────────
  const admin = createAdminClient()
  let contaCodigo: string | null = null
  if (contaBancariaId) {
    // Conta bancária específica da tarefa (multi-banco)
    const { data: cb } = await admin
      .from('contas_bancarias')
      .select('codigo_conta_externo')
      .eq('id', contaBancariaId)
      .single()
    contaCodigo = (cb as any)?.codigo_conta_externo ?? null
  } else if (postoId) {
    // Legado: pega o primeiro banco do posto
    const { data: contas } = await admin
      .from('contas_bancarias')
      .select('codigo_conta_externo')
      .eq('posto_id', postoId)
      .not('codigo_conta_externo', 'is', null)
      .limit(1)
    contaCodigo = (contas?.[0] as any)?.codigo_conta_externo ?? null
  }

  const empresaId = postoResolvido?.codigo_empresa_externo
    ? parseInt(postoResolvido.codigo_empresa_externo)
    : null

  // ── Consulta AUTOSYSTEM para o dia da tarefa ──────────────────────────────
  let movimentoExterno = movimentoExtrato // fallback: sem divergência
  let entradasAS: number | null = null
  let saidasAS:   number | null = null
  let asAcessivel = false

  if (empresaId) {
    try {
      const movtos = await buscarMovtosAutosystem(empresaId, datasAS)
      if (contaCodigo) {
        entradasAS = parseFloat(movtos.filter(m => m.conta_debitar  === contaCodigo).reduce((s, m) => s + m.valor, 0).toFixed(2))
        saidasAS   = parseFloat(movtos.filter(m => m.conta_creditar === contaCodigo).reduce((s, m) => s + m.valor, 0).toFixed(2))
        movimentoExterno = parseFloat((entradasAS - saidasAS).toFixed(2))
      } else {
        movimentoExterno = calcularMovimento(movtos, null)
      }
      asAcessivel = true
    } catch {
      // AUTOSYSTEM inacessível — aceita extrato sem comparação
    }
  }

  const diferenca     = parseFloat((movimentoExtrato - movimentoExterno).toFixed(2))
  const statusExtrato = !asAcessivel || Math.abs(diferenca) < 0.02 ? 'ok' : 'divergente'

  // ── Upload do arquivo ─────────────────────────────────────────────────────
  const nomeArquivo = `${id}/${extratoData}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  await supabase.storage
    .from('extratos-bancarios')
    .upload(nomeArquivo, buffer, { contentType: file.type, upsert: true })

  // ── Atualiza tarefa ───────────────────────────────────────────────────────
  const updates: Record<string, unknown> = {
    extrato_arquivo_path:    nomeArquivo,
    extrato_arquivo_nome:    file.name,
    extrato_data:            extratoData,
    extrato_saldo_dia:       saldoDia,
    extrato_saldo_anterior:  saldoAnterior,
    extrato_movimento:       movimentoExtrato,
    extrato_saldo_externo:   movimentoExterno,
    extrato_diferenca:       diferenca,
    extrato_status:          statusExtrato,
    extrato_validado_em:     new Date().toISOString(),
  }

  if (statusExtrato === 'ok' && tarefa.status !== 'concluido') {
    updates.status              = 'concluido'
    updates.data_conclusao_real = new Date().toISOString()
  }

  await supabase.from('tarefas').update(updates).eq('id', id)

  // Guarda o intervalo de datas do AUTOSYSTEM usado (feriados/fins de semana),
  // para a re-sincronização comparar o mesmo período. Resiliente caso a
  // migration 117 ainda não tenha sido aplicada (erro é ignorado).
  if (datasAS.length > 1) {
    await supabase.from('tarefas').update({ extrato_datas_as: datasAS }).eq('id', id)
  }

  return NextResponse.json({
    ok:               true,
    data:             extratoData,
    saldoDia,
    saldoAnterior,
    movimentoExtrato,
    movimentoExterno,
    entradasAS,
    saidasAS,
    contaCodigo,
    asAcessivel,
    diferenca,
    status:           statusExtrato,
    concluidoAuto:    statusExtrato === 'ok',
  })
}

// ─── GET /api/tarefas/[id]/extrato ────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data } = await supabase
    .from('tarefas')
    .select(`
      extrato_arquivo_nome, extrato_data, extrato_saldo_dia, extrato_saldo_anterior,
      extrato_movimento, extrato_saldo_externo, extrato_diferenca,
      extrato_status, extrato_validado_em
    `)
    .eq('id', id)
    .single()

  return NextResponse.json(data ?? {})
}
