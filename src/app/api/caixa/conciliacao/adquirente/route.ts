import { NextResponse } from 'next/server'
import { exigirRole } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { queryAS } from '@/lib/autosystem'

export const dynamic = 'force-dynamic'

const dec = (b: unknown) => (b && Buffer.isBuffer(b) ? (b as Buffer).toString('latin1') : (b == null ? '' : String(b)))
const gs = (s: string, k: string) => { const m = s.match(new RegExp("'" + k + "':\\s*'([^']*)'")); return m ? m[1] : null }
const gn = (s: string, k: string) => { const m = s.match(new RegExp("'" + k + "':\\s*(-?[0-9.]+)")); return m ? parseFloat(m[1]) : null }

export interface AdqItem {
  liquida: string; venda: string | null; bandeira: string
  bruto: number; taxa: number; liquido: number; antecipacao: number; ok: boolean
}

// GET /api/caixa/conciliacao/adquirente?conta_id=&data_ini=&data_fim=
// Extrato da ADQUIRENTE (Equals → cartao_concilia_extrato): bruto × taxa × líquido
// por bandeira/dia de liquidação, escopado aos recebíveis que caem nesta conta.
export async function GET(req: Request) {
  const auth = await exigirRole(['master', 'adm_financeiro', 'operador_conciliador'])
  if (!auth.ok) return auth.resp

  const { searchParams } = new URL(req.url)
  const contaId = searchParams.get('conta_id')
  const dataIni = searchParams.get('data_ini')
  const dataFim = searchParams.get('data_fim')
  if (!contaId || !dataIni || !dataFim) return NextResponse.json({ error: 'parâmetros faltando' }, { status: 400 })

  const admin = createAdminClient()
  const { data: conta } = await admin
    .from('contas_bancarias').select('codigo_conta_externo, posto:postos(codigo_empresa_externo)').eq('id', contaId).maybeSingle()
  const emp = Number((conta?.posto as any)?.codigo_empresa_externo)
  const code = conta?.codigo_conta_externo as string
  if (!emp || !code) return NextResponse.json({ error: 'Conta sem empresa/código externo' }, { status: 400 })

  try {
    // Contas de recebível (1.3.01.x) que caem nesta conta bancária (mapa RECEBIMENTO)
    const lookback = new Date(new Date(dataFim + 'T00:00:00').getTime() - 200 * 86400000).toISOString().slice(0, 10)
    const map = await queryAS<{ c: string }>(
      `SELECT DISTINCT conta_creditar c FROM movto WHERE empresa=$1 AND conta_debitar=$2 AND conta_creditar LIKE '1.3.01.%' AND data >= $3`,
      [emp, code, lookback])
    const contasReceb = map.map(r => String(r.c)).filter(Boolean)
    if (!contasReceb.size) return NextResponse.json({ itens: [] })

    // Escopa pela coluna `produto` (que mapeia para a conta de recebível), não pelo
    // blob — os agregados nem sempre têm conta_debitar no texto.
    const rows = await queryAS<{ dt: string; ext: Buffer }>(
      `SELECT to_char(data,'YYYY-MM-DD') dt, convert_to(coalesce(extrato,''),'LATIN1') ext
         FROM cartao_concilia_extrato
        WHERE empresa=$1 AND data BETWEEN $2 AND $3 AND length(extrato)>50
          AND produto IN (SELECT produto FROM cartao_concilia_produto_conta WHERE conta = ANY($4::text[]))`,
      [emp, dataIni, dataFim, contasReceb])

    const itens: AdqItem[] = []
    for (const row of rows) {
      const s = dec(row.ext)
      const bruto = gn(s, 'valor_bruto') ?? 0
      if (!bruto) continue
      const taxa = gn(s, 'taxa') ?? 0
      const antec = gn(s, 'taxa_antecipacao') ?? 0
      const liquido = parseFloat((bruto * (1 - (taxa + antec) / 100)).toFixed(2))
      itens.push({
        liquida: row.dt, venda: gs(s, 'data_venda'), bandeira: gs(s, 'produto') || '—',
        bruto: parseFloat(bruto.toFixed(2)), taxa, liquido, antecipacao: antec,
        ok: /'ok':\s*True/.test(s),
      })
    }
    itens.sort((a, b) => a.liquida.localeCompare(b.liquida) || a.bandeira.localeCompare(b.bandeira))
    return NextResponse.json({ itens })
  } catch (e: any) {
    return NextResponse.json({ error: 'AUTOSYSTEM indisponível: ' + (e?.message ?? '') }, { status: 502 })
  }
}
