import { NextResponse } from 'next/server'
import { exigirRole } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { queryAS } from '@/lib/autosystem'

export const dynamic = 'force-dynamic'

const DESDE_PADRAO = '2026-06-01'
const dec = (b: unknown) => (b && Buffer.isBuffer(b) ? (b as Buffer).toString('latin1') : (b == null ? '' : String(b)))

// GET /api/monitoramento/saldos/rastrear?conta_id=UUID[&dia=YYYY-MM-DD][&desde=YYYY-MM-DD]
//  - sem `dia`: trajetória dia-a-dia (banco × AUTOSYSTEM × divergência) para rastrear onde a diferença entrou
//  - com `dia`: lançamentos do AUTOSYSTEM naquele dia (linha por linha)
export async function GET(req: Request) {
  const auth = await exigirRole(['master'])
  if (!auth.ok) return auth.resp

  const { searchParams } = new URL(req.url)
  const contaId = searchParams.get('conta_id')
  const dia     = searchParams.get('dia')
  const desde   = searchParams.get('desde') || DESDE_PADRAO
  if (!contaId) return NextResponse.json({ error: 'conta_id obrigatório' }, { status: 400 })

  const admin = createAdminClient()
  const { data: conta } = await admin
    .from('contas_bancarias')
    .select('id, codigo_conta_externo, conta, banco, posto:postos(nome, codigo_empresa_externo)')
    .eq('id', contaId)
    .maybeSingle()
  if (!conta) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })

  const emp  = Number((conta.posto as any)?.codigo_empresa_externo)
  const code = conta.codigo_conta_externo as string
  if (!emp || !code) return NextResponse.json({ error: 'Conta sem empresa/código externo' }, { status: 400 })
  // Stone zera todo dia (extrato = 0); saldo=0 é válido e a conciliação é contra 0.
  const ehStone = /stone/i.test(String(conta.banco || ''))

  // ── Detalhe de um dia: lançamentos do AUTOSYSTEM ──────────────────────────
  if (dia) {
    let lancamentos: any[] = []
    try {
      const rows = await queryAS<any>(
        `SELECT m.conta_debitar AS deb, m.valor::float AS valor,
                convert_to(coalesce(mo.nome,''),'LATIN1') AS motivo,
                convert_to(coalesce(p.nome,''),'LATIN1')  AS pessoa,
                convert_to(coalesce(m.obs,''),'LATIN1')   AS obs,
                convert_to(coalesce(m.documento,''),'LATIN1') AS documento
           FROM movto m
           LEFT JOIN motivo_movto mo ON mo.grid = m.motivo
           LEFT JOIN pessoa p        ON p.grid  = m.pessoa
          WHERE m.empresa = $1 AND (m.conta_debitar = $2 OR m.conta_creditar = $2) AND m.data = $3
          ORDER BY abs(m.valor) DESC`,
        [emp, code, dia],
      )
      lancamentos = rows.map(r => ({
        direcao:   r.deb === code ? 'entrada' : 'saida',
        valor:     Number(r.valor),
        motivo:    dec(r.motivo),
        pessoa:    dec(r.pessoa),
        obs:       dec(r.obs),
        documento: dec(r.documento),
      }))
    } catch (e: any) {
      return NextResponse.json({ error: 'AUTOSYSTEM indisponível: ' + (e?.message ?? '') }, { status: 502 })
    }
    const mov_total = lancamentos.reduce((s, l) => s + (l.direcao === 'entrada' ? l.valor : -l.valor), 0)
    return NextResponse.json({ dia, mov_total: parseFloat(mov_total.toFixed(2)), lancamentos })
  }

  // ── Trajetória dia-a-dia ──────────────────────────────────────────────────
  let saldoInicial = 0, base31 = 0
  const movPorDia = new Map<string, number>()
  try {
    const si = await queryAS<{ s: number }>(`SELECT COALESCE(saldo_inicial,0)::float s FROM conta WHERE codigo = $1`, [code])
    saldoInicial = Number(si[0]?.s ?? 0)
    const b = await queryAS<{ s: number }>(
      `SELECT COALESCE(SUM(CASE WHEN conta_debitar=$2 THEN valor WHEN conta_creditar=$2 THEN -valor ELSE 0 END),0)::float s
         FROM movto WHERE empresa=$1 AND (conta_debitar=$2 OR conta_creditar=$2) AND data < $3`,
      [emp, code, desde],
    )
    base31 = Number(b[0]?.s ?? 0)
    const diaria = await queryAS<{ d: string; s: number }>(
      `SELECT to_char(data,'YYYY-MM-DD') d,
              SUM(CASE WHEN conta_debitar=$2 THEN valor WHEN conta_creditar=$2 THEN -valor ELSE 0 END)::float s
         FROM movto WHERE empresa=$1 AND (conta_debitar=$2 OR conta_creditar=$2) AND data >= $3
         GROUP BY 1 ORDER BY 1`,
      [emp, code, desde],
    )
    for (const r of diaria) movPorDia.set(r.d, Number(r.s))
  } catch (e: any) {
    return NextResponse.json({ error: 'AUTOSYSTEM indisponível: ' + (e?.message ?? '') }, { status: 502 })
  }

  // Extratos anexados (banco) por data
  const { data: recs } = await admin.from('tarefas_recorrentes').select('id').eq('conta_bancaria_id', contaId)
  const recIds = (recs ?? []).map((r: any) => r.id)
  const extPorDia = new Map<string, { saldo_dia: number; extrato_status: string | null; tarefa_status: string }>()
  if (recIds.length) {
    const { data: exs } = await admin
      .from('tarefas')
      .select('extrato_data, extrato_saldo_dia, extrato_status, status')
      .in('tarefa_recorrente_id', recIds)
      .eq('categoria', 'conciliacao_bancaria')
      .gte('extrato_data', desde)
      .not('extrato_saldo_dia', 'is', null)
      .order('extrato_data')
    for (const t of exs ?? []) {
      // prioriza extrato com saldo != 0 e concluído
      const prev = extPorDia.get(t.extrato_data)
      const cand = { saldo_dia: Number(t.extrato_saldo_dia), extrato_status: t.extrato_status, tarefa_status: t.status }
      if (!prev || (Number(prev.saldo_dia) === 0 && cand.saldo_dia !== 0)) extPorDia.set(t.extrato_data, cand)
    }
  }

  // União de datas (extratos + movimentos), ordenada
  const datas = [...new Set([...movPorDia.keys(), ...extPorDia.keys()])].sort()
  let acumulado = 0
  let divAnterior: number | null = null
  const dias = datas.map((d) => {
    acumulado += movPorDia.get(d) ?? 0
    const saldoAuto = parseFloat((saldoInicial + base31 + acumulado).toFixed(2))
    const ext = extPorDia.get(d)
    const temExtrato = !!ext && (ehStone || ext.saldo_dia !== 0)
    const saldoBanco = temExtrato ? ext!.saldo_dia : null
    const divergencia = temExtrato ? parseFloat((saldoBanco! - saldoAuto).toFixed(2)) : null
    let jump: number | null = null
    let alerta: 'pulo' | 'sem_extrato' | null = null
    if (divergencia != null) {
      jump = divAnterior == null ? divergencia : parseFloat((divergencia - divAnterior).toFixed(2))
      if (Math.abs(jump) > 0.02) alerta = 'pulo'
      divAnterior = divergencia
    } else if ((movPorDia.get(d) ?? 0) !== 0) {
      alerta = 'sem_extrato' // movimento no AUTOSYSTEM sem extrato do banco naquele dia
    }
    return {
      data:             d,
      mov_autosystem:   parseFloat((movPorDia.get(d) ?? 0).toFixed(2)),
      saldo_autosystem: saldoAuto,
      tem_extrato:      temExtrato,
      saldo_banco:      saldoBanco,
      extrato_status:   ext?.extrato_status ?? null,
      tarefa_status:    ext?.tarefa_status ?? null,
      divergencia,
      jump,
      alerta,
    }
  })

  const divAtual = [...dias].reverse().find(x => x.divergencia != null)?.divergencia ?? null

  return NextResponse.json({
    posto_nome:       (conta.posto as any)?.nome ?? '—',
    conta_codigo:     code,
    conta_numero:     conta.conta ?? null,
    banco:            conta.banco ?? null,
    saldo_inicial:    parseFloat(saldoInicial.toFixed(2)),
    divergencia_atual: divAtual,
    desde,
    dias,
  })
}
