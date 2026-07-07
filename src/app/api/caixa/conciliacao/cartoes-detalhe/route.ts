import { NextResponse } from 'next/server'
import { exigirRole } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { queryAS } from '@/lib/autosystem'

export const dynamic = 'force-dynamic'

const dec = (b: unknown) => (b && Buffer.isBuffer(b) ? (b as Buffer).toString('latin1') : (b == null ? '' : String(b)))

// GET /api/caixa/conciliacao/cartoes-detalhe?conta_id=&liquida=&venda=&bandeira=
// Lista VENDA POR VENDA os recebíveis de um grupo (bandeira + dia da venda que
// liquida num certo dia) — o que exatamente baixar no AUTOSYSTEM.
export async function GET(req: Request) {
  const auth = await exigirRole(['master', 'adm_financeiro', 'operador_conciliador'])
  if (!auth.ok) return auth.resp

  const { searchParams } = new URL(req.url)
  const contaId = searchParams.get('conta_id')
  const liquida = searchParams.get('liquida')
  const venda = searchParams.get('venda')
  const bandeira = searchParams.get('bandeira')
  if (!contaId || !liquida || !venda || !bandeira) {
    return NextResponse.json({ error: 'parâmetros obrigatórios faltando' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: conta } = await admin
    .from('contas_bancarias').select('posto:postos(codigo_empresa_externo)').eq('id', contaId).maybeSingle()
  const emp = Number((conta?.posto as any)?.codigo_empresa_externo)
  if (!emp) return NextResponse.json({ error: 'Conta sem empresa externa' }, { status: 400 })

  try {
    const rows = await queryAS<any>(
      `SELECT m.grid, m.valor::float AS valor,
              convert_to(coalesce(m.documento,''),'LATIN1') AS documento,
              convert_to(coalesce(p.nome,''),'LATIN1')      AS pessoa,
              to_char(m.hora,'HH24:MI') AS hora
         FROM movto m
         LEFT JOIN pessoa p       ON p.grid  = m.pessoa
         JOIN motivo_movto mo     ON mo.grid = m.motivo
        WHERE m.empresa = $1 AND m.data = $2 AND m.vencto = $3 AND mo.nome = $4
        ORDER BY m.valor DESC`,
      [emp, venda, liquida, bandeira],
    )
    const itens = rows.map(r => ({
      id: String(r.grid), valor: Number(r.valor),
      documento: dec(r.documento) || null, pessoa: dec(r.pessoa) || null, hora: r.hora || null,
    }))
    return NextResponse.json({ itens })
  } catch (e: any) {
    return NextResponse.json({ error: 'AUTOSYSTEM indisponível: ' + (e?.message ?? '') }, { status: 502 })
  }
}
