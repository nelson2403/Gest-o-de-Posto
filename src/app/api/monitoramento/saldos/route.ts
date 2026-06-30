import { NextResponse } from 'next/server'
import { exigirRole } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { queryAS } from '@/lib/autosystem'

export const dynamic = 'force-dynamic'

export interface SaldoConta {
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
}

// Tolerância de divergência (R$) — diferenças pequenas (centavos / lançamentos
// pendentes) não contam como divergência real; acima disso é item de conciliação.
const TOLERANCIA = 50.0

// GET /api/monitoramento/saldos — somente master
export async function GET() {
  const auth = await exigirRole(['master'])
  if (!auth.ok) return auth.resp

  const admin = createAdminClient()

  // 1) Contas Sicoob + posto (empresa externa para o AUTOSYSTEM)
  const { data: ctas } = await admin
    .from('contas_bancarias')
    .select('id, codigo_conta_externo, conta, posto:postos(id, nome, codigo_empresa_externo)')
    .ilike('banco', '%sicoob%')

  if (!ctas?.length) return NextResponse.json({ contas: [], gerado_em: new Date().toISOString() })

  // 2) Recorrentes de conciliação → conta bancária
  const contaIds = ctas.map((c: any) => c.id)
  const { data: recs } = await admin
    .from('tarefas_recorrentes')
    .select('id, conta_bancaria_id')
    .in('conta_bancaria_id', contaIds)
  const recToConta = new Map<string, string>((recs ?? []).map((r: any) => [r.id, r.conta_bancaria_id]))
  const recIds = (recs ?? []).map((r: any) => r.id)

  // 3) Último extrato anexado por conta (1 por recorrente, em paralelo)
  const ultimoPorConta = new Map<string, { data: string; saldo_dia: number }>()
  await Promise.all(recIds.map(async (rid: string) => {
    const { data } = await admin
      .from('tarefas')
      .select('extrato_data, extrato_saldo_dia')
      .eq('tarefa_recorrente_id', rid)
      .eq('categoria', 'conciliacao_bancaria')
      .not('extrato_saldo_dia', 'is', null)
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

  // 5) Monta resposta
  const contas: SaldoConta[] = (ctas as any[]).map((c) => {
    const ext  = ultimoPorConta.get(c.id)
    const code = c.codigo_conta_externo as string
    const si   = iniByCode.get(code) ?? 0
    const base = {
      posto_id:              c.posto?.id ?? null,
      posto_nome:            c.posto?.nome ?? '—',
      conta_codigo:          code,
      conta_numero:          c.conta ?? null,
      saldo_inicial_lancado: si,
    }
    if (!ext) {
      return { ...base, data_extrato: null, saldo_banco: null, saldo_autosystem: null, divergencia: null, status: 'sem_extrato' as const }
    }
    const movimento = movByCode.get(code)
    const saldoAuto = movimento == null ? null : parseFloat((si + movimento).toFixed(2))
    const div       = saldoAuto == null ? null : parseFloat((ext.saldo_dia - saldoAuto).toFixed(2))
    const status: SaldoConta['status'] =
      saldoAuto == null ? 'diverge'
      : si === 0          ? 'sem_inicial'
      : Math.abs(div!) <= TOLERANCIA ? 'ok'
      : 'diverge'
    return { ...base, data_extrato: ext.data, saldo_banco: ext.saldo_dia, saldo_autosystem: saldoAuto, divergencia: div, status }
  }).sort((a, b) => a.posto_nome.localeCompare(b.posto_nome))

  return NextResponse.json({ contas, gerado_em: new Date().toISOString() })
}
