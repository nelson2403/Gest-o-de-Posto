import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buscarMovtosAutosystem, calcularMovimento } from '@/lib/autosystem'

const CRON_SECRET = process.env.CRON_SECRET

// POST /api/cron/verificar-extratos
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!CRON_SECRET) return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 500 })
  if (secret !== CRON_SECRET)
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()

  // ── 1. Todos os extratos validados ────────────────────────────────────────
  const { data: tarefas } = await admin
    .from('tarefas')
    .select(`
      id, titulo, banco, conta_bancaria_id,
      usuario_id,
      extrato_data, extrato_movimento, extrato_saldo_externo, extrato_status,
      extrato_diferenca_notificada, extrato_datas_as,
      posto_id,
      posto:postos(id, nome, codigo_empresa_externo),
      recorrente:tarefas_recorrentes(usuario_id,
        posto:postos(id, nome, codigo_empresa_externo)),
      conta_bancaria:contas_bancarias(codigo_conta_externo)
    `)
    .eq('categoria', 'conciliacao_bancaria')
    .in('extrato_status', ['ok', 'divergente'])
    .not('extrato_arquivo_path', 'is', null)
    .not('extrato_data', 'is', null)

  if (!tarefas?.length) return NextResponse.json({ verificadas: 0, divergentes: 0 })

  // ── 2. Contas bancárias (fallback para postos com banco único) ─────────────
  const { data: contasBancarias } = await admin
    .from('contas_bancarias')
    .select('id, posto_id, banco, codigo_conta_externo')
    .not('codigo_conta_externo', 'is', null)

  const postoContaCount: Record<string, number> = {}
  const contaMapPosto:   Record<string, string>  = {}
  for (const c of contasBancarias ?? []) {
    if (!c.posto_id) continue
    postoContaCount[c.posto_id] = (postoContaCount[c.posto_id] ?? 0) + 1
  }
  for (const c of contasBancarias ?? []) {
    if (c.posto_id && postoContaCount[c.posto_id] === 1)
      contaMapPosto[c.posto_id] = c.codigo_conta_externo!
  }

  // ── 3. Usuários master/adm_financeiro ──────────────────────────────────────
  const { data: masterAdmins } = await admin
    .from('usuarios')
    .select('id')
    .in('role', ['master', 'adm_financeiro'])

  const masterAdminIds = (masterAdmins ?? []).map(u => u.id as string)

  let verificadas = 0, divergentes = 0

  for (const t of tarefas) {
    const posto = (t.posto as any) ?? (t.recorrente as any)?.posto ?? null
    if (!posto?.codigo_empresa_externo) continue

    const empresaId = parseInt(posto.codigo_empresa_externo)
    if (isNaN(empresaId)) continue

    const postoId      = t.posto_id ?? null
    const contaCodigo: string | null =
      (t.conta_bancaria as any)?.codigo_conta_externo
      ?? (postoId ? (contaMapPosto[postoId] ?? null) : null)

    const dataFim = t.extrato_data as string
    const datasAS: string[] = Array.isArray((t as any).extrato_datas_as) && (t as any).extrato_datas_as.length
      ? (t as any).extrato_datas_as
      : [dataFim]

    // ── 4. Busca movimento ATUAL no AUTOSYSTEM ─────────────────────────────
    let movAtual: number
    try {
      const movtos = await buscarMovtosAutosystem(empresaId, datasAS)
      if (contaCodigo) {
        const entradas = movtos.filter(m => m.conta_debitar  === contaCodigo).reduce((s, m) => s + m.valor, 0)
        const saidas   = movtos.filter(m => m.conta_creditar === contaCodigo).reduce((s, m) => s + m.valor, 0)
        movAtual = parseFloat((entradas - saidas).toFixed(2))
      } else {
        movAtual = calcularMovimento(movtos, null)
      }
    } catch {
      continue
    }

    verificadas++

    const movExtrato   = t.extrato_movimento as number
    const diferenca    = parseFloat((movExtrato - movAtual).toFixed(2))
    const isDivergente = Math.abs(diferenca) > 0.02

    // Valor que estava na última notificação (null = nunca notificou)
    const diferencaNotificada = t.extrato_diferenca_notificada as number | null

    // ── 5. Decide se deve notificar ────────────────────────────────────────
    //
    // Notifica quando:
    //   A) Nova divergência: nunca notificou (null) e agora está divergente
    //   B) Divergência mudou: já notificou com valor X, agora é Y (diferença > R$0,02)
    //   C) Resolvida: última notificação era de divergência (≠0 e ≠null) e agora está OK
    //
    // NÃO notifica quando:
    //   - Estava OK, continua OK
    //   - Divergência é a mesma de antes (dentro de R$0,02 de variação)

    const diferencaMudou = diferencaNotificada !== null
      && Math.abs(diferenca - diferencaNotificada) > 0.02

    const eNovaDiv   = isDivergente && diferencaNotificada === null
    const eMudouDiv  = isDivergente && diferencaMudou
    const eResolvida = !isDivergente && diferencaNotificada !== null && Math.abs(diferencaNotificada) > 0.02

    if (!eNovaDiv && !eMudouDiv && !eResolvida) {
      // Nenhuma mudança relevante — só atualiza o banco se o valor do AS mudou
      if (isDivergente && Math.abs(movAtual - (t.extrato_saldo_externo as number ?? 0)) > 0.01) {
        await admin.from('tarefas').update({
          extrato_saldo_externo: movAtual,
          extrato_diferenca:     diferenca,
        }).eq('id', t.id)
      }
      continue
    }

    // ── 6. Monta a notificação ─────────────────────────────────────────────
    const postoNome = posto.nome ?? 'Posto'
    const banco     = (t.banco as string | null) ?? ''
    const dataFmt   = new Date(dataFim + 'T12:00:00').toLocaleDateString('pt-BR')
    const bancoBrkt = banco ? ` [${banco}]` : ''

    let titulo:  string
    let mensagem: string

    if (eResolvida) {
      titulo   = `Divergência resolvida — ${postoNome}${bancoBrkt}`
      mensagem = [
        `Data: ${dataFmt}`,
        `Extrato bancário: ${fmt(movExtrato)}`,
        `AUTOSYSTEM: ${fmt(movAtual)}`,
        `A conciliação voltou a bater. ✓`,
      ].join('\n')
    } else {
      const sinal  = diferenca > 0 ? '+' : ''
      const era    = eMudouDiv && diferencaNotificada !== null
        ? ` (antes era ${fmt(diferencaNotificada)})`
        : ''

      titulo   = eMudouDiv
        ? `Divergência mudou — ${postoNome}${bancoBrkt}`
        : `Divergência detectada — ${postoNome}${bancoBrkt}`

      mensagem = [
        `Data: ${dataFmt}`,
        `Extrato bancário: ${fmt(movExtrato)}`,
        `AUTOSYSTEM: ${fmt(movAtual)}`,
        `Diferença: ${sinal}${fmt(Math.abs(diferenca))}${era}`,
        `A conciliação precisa ser refeita para este dia.`,
      ].join('\n')

      divergentes++
    }

    // ── 7. Define destinatários ────────────────────────────────────────────
    // Responsável = usuario da tarefa específica (quem fez a conciliação daquele dia)
    // Fallback = usuario do template recorrente
    const responsavelId: string | null =
      (t.usuario_id as string | null)
      ?? (t.recorrente as any)?.usuario_id
      ?? null

    const destinos = [...new Set([...masterAdminIds, ...(responsavelId ? [responsavelId] : [])])]

    // ── 8. Notificações desabilitadas ─────────────────────────────────────────
    // As notificações de divergência foram removidas em favor do painel visual

    // ── 9. Atualiza tarefa com novo estado ─────────────────────────────────
    await admin.from('tarefas').update({
      extrato_saldo_externo:         movAtual,
      extrato_diferenca:             isDivergente ? diferenca : 0,
      extrato_status:                isDivergente ? 'divergente' : 'ok',
      extrato_diferenca_notificada:  isDivergente ? diferenca : 0,
    }).eq('id', t.id)
  }

  console.log(`[cron-extratos] ${new Date().toISOString()} — verificadas=${verificadas} divergentes=${divergentes}`)
  return NextResponse.json({ verificadas, divergentes })
}

function fmt(v: number): string {
  return Math.abs(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
