import { NextResponse } from 'next/server'
import { exigirRole } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { queryAS } from '@/lib/autosystem'

export const dynamic = 'force-dynamic'

const DESDE_PADRAO = '2026-06-01'
const dec = (b: unknown) => (b && Buffer.isBuffer(b) ? (b as Buffer).toString('latin1') : (b == null ? '' : String(b)))
const c2 = (n: number) => Math.round(Math.abs(n) * 100)

export interface Lanc { direcao: 'entrada' | 'saida'; valor: number; motivo: string; pessoa: string; documento: string; duplicado: boolean; casaPulo: boolean }
export interface Pulo { data: string; jump: number; saldo_auto: number; saldo_banco: number | null; duplicados: number; lancamentos: Lanc[] }

// GET /api/monitoramento/diagnostico?conta_id=UUID[&desde=YYYY-MM-DD]
// Acha onde a divergência de saldo ENTROU (pulos) e, em cada dia, os lançamentos
// suspeitos: duplicados (mesmo valor no mesmo dia) e os que casam com o pulo.
export async function GET(req: Request) {
  const auth = await exigirRole(['master', 'operador_conciliador'])
  if (!auth.ok) return auth.resp

  const { searchParams } = new URL(req.url)
  const contaId = searchParams.get('conta_id')
  const desde = searchParams.get('desde') || DESDE_PADRAO
  if (!contaId) return NextResponse.json({ error: 'conta_id obrigatório' }, { status: 400 })

  const admin = createAdminClient()
  const { data: conta } = await admin
    .from('contas_bancarias')
    .select('id, codigo_conta_externo, conta, banco, posto:postos(nome, codigo_empresa_externo)')
    .eq('id', contaId).maybeSingle()
  if (!conta) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })
  const emp = Number((conta.posto as any)?.codigo_empresa_externo)
  const code = conta.codigo_conta_externo as string
  if (!emp || !code) return NextResponse.json({ error: 'Conta sem empresa/código externo' }, { status: 400 })
  const ehStone = /stone/i.test(String(conta.banco || ''))

  // ── Trajetória saldo AUTOSYSTEM × banco (igual ao rastreador) ─────────────
  let saldoInicial = 0, base = 0
  const movPorDia = new Map<string, number>()
  try {
    const si = await queryAS<{ s: number }>(`SELECT COALESCE(saldo_inicial,0)::float s FROM conta WHERE codigo=$1`, [code])
    saldoInicial = Number(si[0]?.s ?? 0)
    const b = await queryAS<{ s: number }>(
      `SELECT COALESCE(SUM(CASE WHEN conta_debitar=$2 THEN valor WHEN conta_creditar=$2 THEN -valor ELSE 0 END),0)::float s
         FROM movto WHERE empresa=$1 AND (conta_debitar=$2 OR conta_creditar=$2) AND data < $3`, [emp, code, desde])
    base = Number(b[0]?.s ?? 0)
    const diaria = await queryAS<{ d: string; s: number }>(
      `SELECT to_char(data,'YYYY-MM-DD') d, SUM(CASE WHEN conta_debitar=$2 THEN valor WHEN conta_creditar=$2 THEN -valor ELSE 0 END)::float s
         FROM movto WHERE empresa=$1 AND (conta_debitar=$2 OR conta_creditar=$2) AND data >= $3 GROUP BY 1`, [emp, code, desde])
    for (const r of diaria) movPorDia.set(r.d, Number(r.s))
  } catch (e: any) {
    return NextResponse.json({ error: 'AUTOSYSTEM indisponível: ' + (e?.message ?? '') }, { status: 502 })
  }

  // Extratos anexados (saldo do dia) por data
  const { data: recs } = await admin.from('tarefas_recorrentes').select('id').eq('conta_bancaria_id', contaId)
  const recIds = (recs ?? []).map((r: any) => r.id)
  const extPorDia = new Map<string, number>()
  if (recIds.length) {
    const { data: exs } = await admin.from('tarefas')
      .select('extrato_data, extrato_saldo_dia').in('tarefa_recorrente_id', recIds)
      .eq('categoria', 'conciliacao_bancaria').gte('extrato_data', desde).not('extrato_saldo_dia', 'is', null).order('extrato_data')
    for (const t of exs ?? []) {
      const prev = extPorDia.get(t.extrato_data)
      const v = Number(t.extrato_saldo_dia)
      if (prev == null || (prev === 0 && v !== 0)) extPorDia.set(t.extrato_data, v)
    }
  }

  const datas = [...new Set([...movPorDia.keys(), ...extPorDia.keys()])].sort()
  let acumulado = 0, divAnterior: number | null = null
  const pulosBrutos: { data: string; jump: number; saldo_auto: number; saldo_banco: number | null }[] = []
  for (const d of datas) {
    acumulado += movPorDia.get(d) ?? 0
    const saldoAuto = parseFloat((saldoInicial + base + acumulado).toFixed(2))
    const ext = extPorDia.get(d)
    const temExtrato = ext != null && (ehStone || ext !== 0)
    const saldoBanco = temExtrato ? ext! : null
    const divergencia = temExtrato ? parseFloat((saldoBanco! - saldoAuto).toFixed(2)) : null
    if (divergencia != null) {
      const jump = divAnterior == null ? divergencia : parseFloat((divergencia - divAnterior).toFixed(2))
      if (Math.abs(jump) > 0.02) pulosBrutos.push({ data: d, jump, saldo_auto: saldoAuto, saldo_banco: saldoBanco })
      divAnterior = divergencia
    }
  }

  // ── Para cada pulo, busca os lançamentos e marca duplicados / que casam ───
  const pulos: Pulo[] = []
  for (const p of pulosBrutos) {
    let lancs: Lanc[] = []
    try {
      const rows = await queryAS<any>(
        `SELECT m.conta_debitar deb, m.valor::float valor,
                convert_to(coalesce(mo.nome,''),'LATIN1') motivo,
                convert_to(coalesce(pe.nome,''),'LATIN1')  pessoa,
                convert_to(coalesce(m.documento,''),'LATIN1') documento
           FROM movto m LEFT JOIN motivo_movto mo ON mo.grid=m.motivo LEFT JOIN pessoa pe ON pe.grid=m.pessoa
          WHERE m.empresa=$1 AND (m.conta_debitar=$2 OR m.conta_creditar=$2) AND m.data=$3
          ORDER BY abs(m.valor) DESC`, [emp, code, p.data])
      // conta ocorrências por valor (para achar duplicados)
      const cont = new Map<number, number>()
      for (const r of rows) { const k = c2(Number(r.valor)); cont.set(k, (cont.get(k) ?? 0) + 1) }
      const alvo = c2(p.jump)
      lancs = rows.map(r => {
        const val = Number(r.valor); const k = c2(val)
        return {
          direcao: (r.deb === code ? 'entrada' : 'saida') as 'entrada' | 'saida',
          valor: val, motivo: dec(r.motivo), pessoa: dec(r.pessoa), documento: dec(r.documento),
          duplicado: (cont.get(k) ?? 0) >= 2,
          casaPulo: k === alvo && alvo > 0,
        }
      })
    } catch { /* segue */ }
    // ordena: duplicados e os que casam primeiro
    lancs.sort((a, b) => (Number(b.duplicado || b.casaPulo) - Number(a.duplicado || a.casaPulo)) || Math.abs(b.valor) - Math.abs(a.valor))
    pulos.push({ ...p, duplicados: lancs.filter(l => l.duplicado).length, lancamentos: lancs })
  }

  const divAtual = divAnterior
  return NextResponse.json({
    posto_nome: (conta.posto as any)?.nome ?? '—', conta_numero: conta.conta ?? null, banco: conta.banco ?? null,
    divergencia_atual: divAtual, desde, pulos,
  })
}
