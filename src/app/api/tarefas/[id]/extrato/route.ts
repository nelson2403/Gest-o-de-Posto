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

// ─── Parser de OFX (SGML) — usado pela Stone (e bancos que exportam .ofx) ─────
type OfxTxn = { tipo: string; data: string; valor: number; memo: string }
function parseOFX(texto: string): { txns: OfxTxn[]; saldoFinal: number | null } {
  // Valores OFX usam tags sem fechamento (SGML): pega o conteúdo até < ou quebra
  const tag = (bloco: string, t: string): string => {
    const m = bloco.match(new RegExp(`<${t}>\\s*([^<\\r\\n]+)`, 'i'))
    return m ? m[1].trim() : ''
  }
  const txns: OfxTxn[] = []
  const blocos = texto.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? []
  for (const b of blocos) {
    const dt = tag(b, 'DTPOSTED')               // YYYYMMDDHHMMSS
    const data = dt.length >= 8 ? `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}` : ''
    const valor = parseFloat(tag(b, 'TRNAMT').replace(',', '.'))
    if (!data || isNaN(valor)) continue
    txns.push({ tipo: tag(b, 'TRNTYPE').toUpperCase(), data, valor, memo: tag(b, 'MEMO') })
  }
  // Saldo final do extrato (LEDGERBAL → BALAMT)
  const bal = texto.match(/<LEDGERBAL>[\s\S]*?<BALAMT>\s*([^<\r\n]+)/i)
  const saldoFinal = bal ? parseFloat(bal[1].replace(',', '.')) : null
  return { txns, saldoFinal: saldoFinal != null && !isNaN(saldoFinal) ? saldoFinal : null }
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

  // ── Lê o arquivo (OFX, Excel ou CSV) ──────────────────────────────────────
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const bytes  = new Uint8Array(buffer)
  // OFX é texto SGML — detecta pelo cabeçalho ANTES de tentar abrir como Excel
  const isOFX = /OFXHEADER|<OFX>/i.test(new TextDecoder('latin1').decode(bytes.slice(0, 512)))

  let extratoData = ''
  let saldoDia    = 0
  let saldoAnterior = 0
  let movimentoExtrato = 0
  let datasAS: string[] = []
  let extratoEhStone = false

  if (isOFX) {
    // ── Parser OFX (Stone) ─────────────────────────────────────────────────
    const texto = new TextDecoder('latin1').decode(bytes)   // CHARSET:1252
    const { txns, saldoFinal } = parseOFX(texto)
    if (!txns.length) {
      return NextResponse.json({ error: 'Arquivo OFX sem transações (STMTTRN). Verifique se é o extrato correto.' }, { status: 422 })
    }
    const datasNoArquivo = [...new Set(txns.map(t => t.data))]

    let targetDate: string
    if (dataEsperada) {
      if (!datasNoArquivo.includes(dataEsperada)) {
        const lista = datasNoArquivo.map(s => s.split('-').reverse().join('/')).join(', ')
        return NextResponse.json({
          error: `O extrato OFX não contém a data ${dataEsperada.split('-').reverse().join('/')} (data desta tarefa). Datas encontradas: ${lista || 'nenhuma'}.`,
        }, { status: 422 })
      }
      targetDate = dataEsperada
    } else {
      const sorted = datasNoArquivo.slice().sort()
      targetDate = sorted[sorted.length - 1] ?? ''
      if (!targetDate) return NextResponse.json({ error: 'Extrato OFX vazio ou inválido.' }, { status: 422 })
    }

    // Feriado/fim de semana: agrega o dia-alvo + dias não-úteis anteriores que existam no arquivo
    const datasAgregadas = datasConciliacao(targetDate).filter(d => d === targetDate || datasNoArquivo.includes(d))
    const txnsForDate = txns.filter(t => datasAgregadas.includes(t.data))
    const txnsTarget  = txns.filter(t => t.data === targetDate)

    // O AUTOSYSTEM registra os recebíveis QUE FICARAM DISPONÍVEIS (entram de fato
    // na conta), não a venda bruta. Na Stone:
    //  - "Recebimento vendas" (CREDIT) + "Recebimento Guardado - Taxas Inteligentes"
    //    (DEBIT) formam um par de MESMO valor que se anula: a venda é registrada e
    //    reservada na mesma hora → NÃO é dinheiro real entrando.
    //  - "Recebimento Disponível" (CREDIT) = recebível liberado, dinheiro entrando
    //    (depois sai via "Transferência automática" para a conta principal).
    // Então o movimento a comparar com as ENTRADAS do AUTOSYSTEM = soma dos
    // "Recebimento Disponível". (Equivale à coluna "Recebível de Cartão" do CSV.)
    const ehDisponivel = (t: OfxTxn) => t.tipo === 'CREDIT' && /dispon/i.test(t.memo)
    const disponiveis  = txnsForDate.filter(ehDisponivel)
    movimentoExtrato = parseFloat(disponiveis.reduce((s, t) => s + t.valor, 0).toFixed(2))
    extratoEhStone = true

    // Saldo: usa o LEDGERBAL do arquivo; saldo anterior = saldo − movimento líquido do dia
    const movLiquidoDia = txnsTarget.reduce((s, t) => s + t.valor, 0)
    saldoDia      = parseFloat((saldoFinal != null ? saldoFinal : movLiquidoDia).toFixed(2))
    saldoAnterior = parseFloat((saldoDia - movLiquidoDia).toFixed(2))
    extratoData   = targetDate
    datasAS       = datasAgregadas

  } else {
  const wb     = XLSX.read(buffer, { type: 'array', cellDates: false })
  const ws     = wb.Sheets[wb.SheetNames[0]]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  // ── Detecta formato: Stone (CSV) ou Sicoob (Excel) ────────────────────────
  const isStone = rows.some(row => /^(Débito|Crédito)$/i.test(String(row[0] ?? '').trim()))

  if (isStone) {
    // ── Parser Stone ──────────────────────────────────────────────────────
    // Colunas: Movimentação | Tipo | Valor | Saldo antes | Saldo depois | Tarifa | Data
    //          (col0=Déb/Créd, col1=Transação/Recebível de Cartão, col2=Valor, col6=Data)
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

    // O AUTOSYSTEM registra nessa conta apenas os RECEBÍVEIS DE CARTÃO (as vendas no
    // cartão entrando), não as transferências/saques da conta Stone. Por isso o
    // movimento a comparar é a soma só das linhas "Recebível de Cartão". As linhas
    // "Transação" são transferências internas da conta e não entram. Fallback: se o
    // arquivo não tiver esse tipo (layout antigo), soma tudo.
    const ehRecebivelCartao = (r: unknown[]) => {
      const tipo = String(r[1] ?? '').trim().toLowerCase()
      return tipo.includes('receb') && tipo.includes('cart')
    }
    const rowsRecebivel = rowsForDate.filter(ehRecebivelCartao)
    const baseMovimento = rowsRecebivel.length ? rowsRecebivel : rowsForDate
    movimentoExtrato = parseFloat(
      baseMovimento.reduce((sum, r) => sum + parseValorBRSigned(r[2]), 0).toFixed(2)
    )
    extratoEhStone = true

    // Saldo do dia: o arquivo vem em ordem decrescente de data/hora, então a 1ª
    // linha do dia-alvo é a mais recente (col "Saldo depois" = fechamento). O saldo
    // anterior é o fechamento menos o movimento líquido (todas as linhas) do dia.
    const movimentoLiquidoDia = rowsTargetDate.reduce((s, r) => s + parseValorBRSigned(r[2]), 0)
    const fimDia = rowsTargetDate[0] ?? rowsTargetDate[rowsTargetDate.length - 1]
    saldoDia      = parseFloat(parseValorBRSigned(fimDia[4]).toFixed(2))
    saldoAnterior = parseFloat((saldoDia - movimentoLiquidoDia).toFixed(2))
    extratoData   = targetDate
    datasAS       = datasAgregadas

  } else {
    // ── Parser Sicoob Excel (robusto a variações de coluna/layout) ────────
    const saldosDia: Array<{ data: string; valor: number }> = []
    let saldoAnteriorArquivo: number | null = null

    // Procura o rótulo em QUALQUER coluna (há extratos com coluna inicial vazia,
    // célula mesclada, etc.). A DATA é a primeira célula de data da linha — se não
    // houver, usa a data da tarefa.
    const dataDaLinha = (row: unknown[]): string | null => {
      for (const c of row) { const d = parseDataExcel(c); if (d) return d }
      return null
    }
    // O VALOR do saldo é a primeira célula em formato BRASILEIRO (vírgula decimal
    // ou sufixo C/D) DEPOIS do rótulo. Isso ignora colunas auxiliares em formato
    // US que algumas exportações trazem no fim da linha (ex.: "5878.6",
    // "-14101.19"), que o parser BR leria errado (ponto = milhar).
    const ehMonetarioBR = (s: string) => !!s && /\d/.test(s) && (/,/.test(s) || /[CDcd*]\s*$/.test(s))
    const valorAposRotulo = (cels: string[], idxRotulo: number): number => {
      for (let j = idxRotulo + 1; j < cels.length; j++) if (ehMonetarioBR(cels[j])) return parseValorBRSigned(cels[j])
      for (const c of cels) if (ehMonetarioBR(c)) return parseValorBRSigned(c) // fallback
      return 0
    }

    let dataMaxArquivo: string | null = null
    for (const row of rows) {
      const d0 = dataDaLinha(row)
      if (d0 && (!dataMaxArquivo || d0 > dataMaxArquivo)) dataMaxArquivo = d0
    }

    for (const row of rows) {
      const cels = row.map(c => String(c ?? '').trim())
      const up   = cels.map(c => c.toUpperCase())
      const idxDia = up.findIndex(c => c.includes('SALDO DO DIA'))
      const idxAnt = up.findIndex(c => c.includes('SALDO ANTERIOR') && !c.includes('BLOQUEAD'))
      if (idxDia >= 0) {
        const d = dataDaLinha(row) ?? dataEsperada ?? dataMaxArquivo
        if (d) saldosDia.push({ data: d, valor: valorAposRotulo(cels, idxDia) })
      }
      if (idxAnt >= 0 && saldoAnteriorArquivo === null) {
        saldoAnteriorArquivo = valorAposRotulo(cels, idxAnt)
      }
    }

    if (saldosDia.length === 0 || saldoAnteriorArquivo === null) {
      // Loga a estrutura real do arquivo para diagnosticar layouts novos do Sicoob.
      const amostra = rows.filter(r => r.some(c => String(c ?? '').trim() !== '')).slice(0, 40)
      console.error('[extrato-sicoob] SALDO DO DIA/ANTERIOR nao encontrado. saldosDia=' +
        saldosDia.length + ' saldoAnterior=' + saldoAnteriorArquivo +
        ' | amostra de linhas: ' + JSON.stringify(amostra))
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
  }

  // ── Busca código da conta no AUTOSYSTEM ───────────────────────────────────
  const admin = createAdminClient()
  let contaCodigo: string | null = null
  let contaBanco:  string | null = null
  if (contaBancariaId) {
    // Conta bancária específica da tarefa (multi-banco)
    const { data: cb } = await admin
      .from('contas_bancarias')
      .select('codigo_conta_externo, banco')
      .eq('id', contaBancariaId)
      .single()
    contaCodigo = (cb as any)?.codigo_conta_externo ?? null
    contaBanco  = (cb as any)?.banco ?? null
  } else if (postoId) {
    // Legado: pega o primeiro banco do posto
    const { data: contas } = await admin
      .from('contas_bancarias')
      .select('codigo_conta_externo, banco')
      .eq('posto_id', postoId)
      .not('codigo_conta_externo', 'is', null)
      .limit(1)
    contaCodigo = (contas?.[0] as any)?.codigo_conta_externo ?? null
    contaBanco  = (contas?.[0] as any)?.banco ?? null
  }

  // ── Valida que o BANCO do extrato bate com o BANCO da tarefa ──────────────
  // Impede, por exemplo, comparar um extrato Stone contra a conta Sicoob da
  // tarefa (foi o que aconteceu: extrato Stone anexado numa tarefa do Sicoob).
  if (contaBanco) {
    const contaEhStone = /stone/i.test(contaBanco)
    if (extratoEhStone && !contaEhStone) {
      return NextResponse.json({
        error: `Este arquivo é um extrato da STONE, mas esta tarefa é de conciliação do ${contaBanco} (conta ${contaCodigo ?? '—'}). Anexe o extrato do banco correto — ou use a tarefa Stone deste posto.`,
      }, { status: 422 })
    }
    if (!extratoEhStone && contaEhStone) {
      return NextResponse.json({
        error: `Esta tarefa é de conciliação da STONE, mas o arquivo enviado não parece um extrato Stone (OFX). Anexe o extrato Stone deste posto.`,
      }, { status: 422 })
    }
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
        // Stone: o extrato traz só os recebíveis de cartão (entradas); as
        // transferências/saques não são lançados nessa conta do AUTOSYSTEM. Então
        // comparamos contra as ENTRADAS, não o líquido. Demais bancos: líquido.
        movimentoExterno = extratoEhStone
          ? entradasAS
          : parseFloat((entradasAS - saidasAS).toFixed(2))
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

  // Usa o admin (service role) para gravar — assim a conclusão "gruda" mesmo
  // para operador_conciliador (a sessão do usuário esbarrava no RLS e o status
  // não virava 'concluido' apesar do extrato ficar 'ok').
  await admin.from('tarefas').update(updates).eq('id', id)

  // Guarda o intervalo de datas do AUTOSYSTEM usado (feriados/fins de semana),
  // para a re-sincronização comparar o mesmo período. Resiliente caso a
  // migration 117 ainda não tenha sido aplicada (erro é ignorado).
  if (datasAS.length > 1) {
    await admin.from('tarefas').update({ extrato_datas_as: datasAS }).eq('id', id)
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
    extratoEhStone,
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
