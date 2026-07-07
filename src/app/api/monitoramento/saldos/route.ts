import { NextResponse } from 'next/server'
import { exigirRole } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { queryAS } from '@/lib/autosystem'

export const dynamic = 'force-dynamic'

export interface SaldoConta {
  conta_id:               string
  posto_id:               string | null
  posto_nome:             string
  conta_codigo:           string
  conta_numero:           string | null
  data_extrato:           string | null
  saldo_banco:            number | null
  saldo_inicial_lancado:  number
  saldo_autosystem:       number | null
  divergencia:            number | null
  status:                 'ok' | 'diverge' | 'sem_inicial' | 'sem_extrato'
  extratos_abertos:       number
  observacao:             string
  obs_atualizado_em:      string | null
  obs_atualizado_por:     string | null
}

// Tolerância de divergência (R$) — sem margem: só arredondamento de centavo.
// Qualquer diferença a partir de ~R$0,02 já conta como divergência.
const TOLERANCIA = 0.01

// GET /api/monitoramento/saldos?banco=sicoob|stone — somente master
export async function GET(req: Request) {
  const auth = await exigirRole(['master', 'operador_conciliador'])
  if (!auth.ok) return auth.resp

  const { searchParams } = new URL(req.url)
  const banco  = (searchParams.get('banco') || 'sicoob').toLowerCase()
  const filtro = banco === 'stone' ? '%stone%' : '%sicoob%'
  // O Stone é conta que ZERA todo dia (recebíveis entram e uma transferência
  // varre o saldo pra 0). O extrato do Stone vem com saldo = 0. Então, pro Stone,
  // saldo=0 é um saldo VÁLIDO e a conciliação é: AUTOSYSTEM deve estar em 0 também.
  const ehStone = banco === 'stone'

  const admin = createAdminClient()

  // 1) Contas do banco escolhido + posto (empresa externa para o AUTOSYSTEM)
  const { data: ctas } = await admin
    .from('contas_bancarias')
    .select('id, codigo_conta_externo, conta, posto:postos(id, nome, codigo_empresa_externo)')
    .ilike('banco', filtro)

  if (!ctas?.length) return NextResponse.json({ banco, contas: [], gerado_em: new Date().toISOString() })

  // 2) Recorrentes de conciliação → conta bancária
  const contaIds = ctas.map((c: any) => c.id)
  const { data: recs } = await admin
    .from('tarefas_recorrentes')
    .select('id, conta_bancaria_id')
    .in('conta_bancaria_id', contaIds)
  const recToConta = new Map<string, string>((recs ?? []).map((r: any) => [r.id, r.conta_bancaria_id]))
  const recIds = (recs ?? []).map((r: any) => r.id)

  // 3) Último extrato CONCLUÍDO por conta (ignora em_andamento e extratos sem saldo).
  //    Extratos em aberto não podem ancorar a comparação — a conciliação daquele
  //    dia ainda não fechou, então a divergência seria falsa.
  const ultimoPorConta = new Map<string, { data: string; saldo_dia: number }>()
  await Promise.all(recIds.map(async (rid: string) => {
    let q = admin
      .from('tarefas')
      .select('extrato_data, extrato_saldo_dia')
      .eq('tarefa_recorrente_id', rid)
      .eq('categoria', 'conciliacao_bancaria')
      .eq('status', 'concluido')
      .not('extrato_saldo_dia', 'is', null)
    // Sicoob: ignora saldo=0 (extrato não parseado). Stone: saldo=0 é válido.
    if (!ehStone) q = q.neq('extrato_saldo_dia', 0)
    const { data } = await q
      .order('extrato_data', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data?.extrato_data) return
    const cid = recToConta.get(rid)!
    const prev = ultimoPorConta.get(cid)
    if (!prev || data.extrato_data > prev.data) {
      ultimoPorConta.set(cid, { data: data.extrato_data, saldo_dia: Number(data.extrato_saldo_dia) })
    }
  }))

  // 3b) Extratos de conciliação EM ABERTO (não concluídos) por conta — contextualiza
  //     divergências que são, na verdade, dias ainda pendentes de conciliação.
  const abertosPorConta = new Map<string, number>()
  {
    const { data: abertos } = await admin
      .from('tarefas')
      .select('tarefa_recorrente_id')
      .in('tarefa_recorrente_id', recIds)
      .eq('categoria', 'conciliacao_bancaria')
      .neq('status', 'concluido')
      .gte('extrato_data', '2026-01-01')
    for (const a of abertos ?? []) {
      const cid = recToConta.get((a as any).tarefa_recorrente_id)
      if (cid) abertosPorConta.set(cid, (abertosPorConta.get(cid) ?? 0) + 1)
    }
  }

  // 4) AUTOSYSTEM: movimentos acumulados até a data do extrato + saldo inicial lançado
  const alvos = ctas
    .map((c: any) => ({
      id:   c.id,
      emp:  Number(c.posto?.codigo_empresa_externo),
      code: c.codigo_conta_externo as string,
      ext:  ultimoPorConta.get(c.id),
    }))
    .filter((a) => a.ext && a.emp && a.code)

  const movByCode = new Map<string, number>()
  const iniByCode = new Map<string, number>()

  if (alvos.length) {
    const emps  = alvos.map((a) => a.emp)
    const codes = alvos.map((a) => a.code)
    const datas = alvos.map((a) => a.ext!.data)

    try {
      const movRows = await queryAS<{ code: string; saldo_mov: number }>(
        `SELECT a.code,
                COALESCE(SUM(CASE WHEN m.conta_debitar = a.code THEN m.valor
                                  WHEN m.conta_creditar = a.code THEN -m.valor
                                  ELSE 0 END), 0)::float AS saldo_mov
           FROM unnest($1::bigint[], $2::text[], $3::date[]) AS a(emp, code, ate)
           LEFT JOIN movto m
                  ON m.empresa = a.emp
                 AND (m.conta_debitar = a.code OR m.conta_creditar = a.code)
                 AND m.data <= a.ate
          GROUP BY a.code`,
        [emps, codes, datas],
      )
      for (const r of movRows) movByCode.set(r.code, Number(r.saldo_mov))

      // Saldo inicial cadastrado no plano de contas do AUTOSYSTEM (conta.saldo_inicial).
      // É onde o AUTOSYSTEM grava o saldo inicial lançado na conta (chave = código da conta).
      const iniRows = await queryAS<{ conta: string; si: number }>(
        `SELECT codigo AS conta, COALESCE(saldo_inicial, 0)::float AS si
           FROM conta
          WHERE codigo = ANY($1::text[])`,
        [codes],
      )
      for (const r of iniRows) iniByCode.set(r.conta, Number(r.si))
    } catch {
      // AUTOSYSTEM indisponível — devolve só os saldos do banco (autosystem null)
    }
  }

  // 5) Observações (motivo das divergências) — tolera a tabela ainda não existir
  const obsByConta = new Map<string, { observacao: string; atualizado_em: string | null; atualizado_por: string | null }>()
  {
    const { data: obsRows } = await admin
      .from('saldo_bancario_observacoes')
      .select('conta_bancaria_id, observacao, atualizado_em, atualizado_por')
      .in('conta_bancaria_id', contaIds)
    for (const o of obsRows ?? []) {
      obsByConta.set(o.conta_bancaria_id, {
        observacao: o.observacao ?? '', atualizado_em: o.atualizado_em ?? null, atualizado_por: o.atualizado_por ?? null,
      })
    }
  }

  // 6) Monta resposta
  const contas: SaldoConta[] = (ctas as any[]).map((c) => {
    const ext  = ultimoPorConta.get(c.id)
    const code = c.codigo_conta_externo as string
    const si   = iniByCode.get(code) ?? 0
    const obs  = obsByConta.get(c.id)
    const base = {
      conta_id:              c.id as string,
      posto_id:              c.posto?.id ?? null,
      posto_nome:            c.posto?.nome ?? '—',
      conta_codigo:          code,
      conta_numero:          c.conta ?? null,
      saldo_inicial_lancado: si,
      extratos_abertos:      abertosPorConta.get(c.id) ?? 0,
      observacao:            obs?.observacao ?? '',
      obs_atualizado_em:     obs?.atualizado_em ?? null,
      obs_atualizado_por:    obs?.atualizado_por ?? null,
    }
    if (!ext) {
      return { ...base, data_extrato: null, saldo_banco: null, saldo_autosystem: null, divergencia: null, status: 'sem_extrato' as const }
    }
    const movimento = movByCode.get(code)
    const saldoAuto = movimento == null ? null : parseFloat((si + movimento).toFixed(2))
    // Stone: o OFX reporta LEDGERBAL=0, mas a conta pode GUARDAR saldo. Se o extrato
    // veio 0 e o AUTOSYSTEM tem saldo, esse 0 NÃO é o saldo real (peculiaridade do
    // OFX Stone) → trata como sem extrato confiável, não como divergência falsa.
    if (ehStone && ext.saldo_dia === 0 && saldoAuto != null && Math.abs(saldoAuto) > TOLERANCIA) {
      return { ...base, data_extrato: ext.data, saldo_banco: null, saldo_autosystem: saldoAuto, divergencia: null, status: 'sem_extrato' as const }
    }
    const div       = saldoAuto == null ? null : parseFloat((ext.saldo_dia - saldoAuto).toFixed(2))
    const status: SaldoConta['status'] =
      saldoAuto == null ? 'diverge'
      // Stone: conciliado quando o AUTOSYSTEM está zerado (= extrato); sem "sem inicial".
      : ehStone           ? (Math.abs(div!) <= TOLERANCIA ? 'ok' : 'diverge')
      : si === 0          ? 'sem_inicial'
      : Math.abs(div!) <= TOLERANCIA ? 'ok'
      : 'diverge'
    return { ...base, data_extrato: ext.data, saldo_banco: ext.saldo_dia, saldo_autosystem: saldoAuto, divergencia: div, status }
  }).sort((a, b) => a.posto_nome.localeCompare(b.posto_nome))

  return NextResponse.json({ banco, contas, gerado_em: new Date().toISOString() })
}

// POST /api/monitoramento/saldos — salva a observação de uma conta (somente master)
export async function POST(req: Request) {
  const auth = await exigirRole(['master', 'operador_conciliador'])
  if (!auth.ok) return auth.resp

  const { conta_id, observacao } = await req.json().catch(() => ({})) as {
    conta_id?: string; observacao?: string
  }
  if (!conta_id) return NextResponse.json({ error: 'conta_id obrigatório' }, { status: 400 })

  const admin = createAdminClient()

  // Nome de quem editou (para exibir "atualizado por")
  const { data: u } = await admin.from('usuarios').select('nome').eq('id', auth.user.id).maybeSingle()

  const { error } = await admin
    .from('saldo_bancario_observacoes')
    .upsert({
      conta_bancaria_id: conta_id,
      observacao:        (observacao ?? '').slice(0, 2000),
      atualizado_em:     new Date().toISOString(),
      atualizado_por:    u?.nome ?? null,
    }, { onConflict: 'conta_bancaria_id' })

  if (error) {
    const msg = /relation .* does not exist|schema cache/i.test(error.message)
      ? 'Tabela de observações ainda não criada — rode a migration 134 no Supabase.'
      : error.message
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json({ ok: true, atualizado_por: u?.nome ?? null, atualizado_em: new Date().toISOString() })
}
