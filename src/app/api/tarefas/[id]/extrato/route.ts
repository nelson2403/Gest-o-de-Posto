import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import * as XLSX from 'xlsx'

// ─── Converte valor BR do Excel para número (absoluto) ───────────────────────
// "21.365,51 C" → 21365.51  |  "34.276,33 D" → 34276.33
function parseValorBR(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return 0
  if (typeof raw === 'number') return Math.abs(raw)
  const str = String(raw).trim()
  const semSufixo = str.replace(/\s*[CDcd*]\s*$/, '').trim()
  const semSinal  = semSufixo.replace(/^-\s*/, '').trim()
  const norm      = semSinal.replace(/\./g, '').replace(',', '.')
  const num       = parseFloat(norm)
  return isNaN(num) ? 0 : num
}

// ─── Converte valor BR do Excel preservando o sinal ──────────────────────────
// "21.365,51 C" → +21365.51  |  "747,61 D" ou "-747,61" → -747.61
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
    if (d) {
      return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
    }
  }
  const str   = String(raw).trim()
  const partes = str.split('/')
  if (partes.length === 3) {
    return `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  return null
}

// ─── Calcula movimento do AutoSystem mirror ───────────────────────────────────
async function calcMovimentoAS(
  admin: ReturnType<typeof createAdminClient>,
  empresaId: number,
  datas: string[],
  contaCodigo: string | null,
): Promise<number> {
  const { data: movtos } = await admin
    .from('as_movto')
    .select('conta_debitar, conta_creditar, valor')
    .eq('empresa', empresaId)
    .in('data', datas)

  if (contaCodigo) {
    const debito  = (movtos ?? []).filter(m => m.conta_debitar  === contaCodigo).reduce((s, m) => s + (m.valor ?? 0), 0)
    const credito = (movtos ?? []).filter(m => m.conta_creditar === contaCodigo).reduce((s, m) => s + (m.valor ?? 0), 0)
    return parseFloat((debito - credito).toFixed(2))
  } else {
    // Fallback: conta 1.2.* excluindo transferências internas
    const debito  = (movtos ?? []).filter(m => m.conta_debitar?.startsWith('1.2.')  && !m.conta_creditar?.startsWith('1.2.')).reduce((s, m) => s + (m.valor ?? 0), 0)
    const credito = (movtos ?? []).filter(m => m.conta_creditar?.startsWith('1.2.') && !m.conta_debitar?.startsWith('1.2.')).reduce((s, m) => s + (m.valor ?? 0), 0)
    return parseFloat((debito - credito).toFixed(2))
  }
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

  // ── Busca tarefa com posto ────────────────────────────────────────────────
  const { data: tarefa } = await supabase
    .from('tarefas')
    .select(`
      id, status, categoria, posto_id, tarefa_recorrente_id,
      posto:postos(id, nome, codigo_empresa_externo),
      recorrente:tarefas_recorrentes(posto_id, posto:postos(id, nome, codigo_empresa_externo))
    `)
    .eq('id', id)
    .single()

  if (!tarefa) return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })
  if (tarefa.categoria !== 'conciliacao_bancaria') {
    return NextResponse.json({ error: 'Esta tarefa não é de conciliação bancária' }, { status: 400 })
  }

  type PostoInfo = { id: string; nome: string; codigo_empresa_externo: string | null }
  const recorrente = tarefa.recorrente as unknown as { posto_id: string | null; posto: PostoInfo | null } | null
  const postoResolvido: PostoInfo | null =
    (tarefa.posto as unknown as PostoInfo | null) ??
    recorrente?.posto ??
    null

  const postoId: string | null =
    (tarefa.posto_id as string | null) ??
    (recorrente?.posto_id ?? null) ??
    postoResolvido?.id ??
    null

  // ── Lê o arquivo Excel ────────────────────────────────────────────────────
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

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

  saldosDia.sort((a, b) => a.data.localeCompare(b.data))

  const extratoData      = saldosDia[saldosDia.length - 1].data
  const saldoDia         = saldosDia[saldosDia.length - 1].valor
  const movimentoExtrato = parseFloat((saldoDia - saldoAnterior).toFixed(2))

  // ── Busca conta bancária mapeada ──────────────────────────────────────────
  let contaCodigo: string | null = null
  if (postoId) {
    const admin = createAdminClient()
    const { data: contasMapeadas } = await admin
      .from('contas_bancarias')
      .select('id, banco, codigo_conta_externo')
      .eq('posto_id', postoId)
      .not('codigo_conta_externo', 'is', null)
      .limit(1)
    contaCodigo = (contasMapeadas?.[0] as any)?.codigo_conta_externo ?? null
  }

  let empresaId: number | null = postoResolvido?.codigo_empresa_externo
    ? parseInt(postoResolvido.codigo_empresa_externo)
    : null

  if (!empresaId) {
    return NextResponse.json({
      error: `Não foi possível identificar a empresa do posto "${postoResolvido?.nome ?? '(sem posto)'}". Configure o "Código AUTOSYSTEM" na conta bancária do posto ou o "Código Empresa AUTOSYSTEM" no cadastro do posto.`,
    }, { status: 400 })
  }

  // ── Consulta mirror (as_movto) ────────────────────────────────────────────
  const admin = createAdminClient()
  const datas = saldosDia.map(s => s.data)
  const movimentoExterno = await calcMovimentoAS(admin, empresaId, datas, contaCodigo)

  const diferenca     = parseFloat((movimentoExtrato - movimentoExterno).toFixed(2))
  const statusExtrato = Math.abs(diferenca) < 0.02 ? 'ok' : 'divergente'

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

  return NextResponse.json({
    ok:               true,
    data:             extratoData,
    dias:             datas,
    saldoDia,
    saldoAnterior,
    movimentoExtrato,
    movimentoExterno,
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
