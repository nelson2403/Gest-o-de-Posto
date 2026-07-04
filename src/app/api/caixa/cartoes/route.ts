import { NextResponse } from 'next/server'
import { exigirRole } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { queryAS } from '@/lib/autosystem'

export const dynamic = 'force-dynamic'

const dec = (b: unknown) => (b && Buffer.isBuffer(b) ? (b as Buffer).toString('latin1') : (b == null ? '' : String(b)))

// Formas de pagamento que são cartão / TEF (para separar do dinheiro/pix/cheque).
const FILTRO_CARTAO = [
  '%CARTAO%', '%TEF%', '%VISA%', '%MASTER%', '%ELO %', '%ELO-%', '%ELO CREDITO%', '%ELO DEBITO%',
  '%AMEX%', '%AMERICAN EX%', '%HIPER%', '%DINERS%', '%MAESTRO%', '%SHELL BOX%', '%GOODCARD%',
  '%ALELO%', '%SODEXO%', '%TICKET%', '%VR AUTO%', '%VR ALIMENT%', '%BEN %', '%BANRICOMPRAS%',
]

async function mapaNomes(logins: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  const lst = [...new Set(logins.filter(Boolean))]
  if (!lst.length) return m
  try {
    const rows = await queryAS<{ login: string; nome: string }>(
      `SELECT u.nome AS login, convert_to(coalesce(p.nome,''),'LATIN1') AS nome
         FROM usuario u LEFT JOIN pessoa p ON p.grid = u.pessoa WHERE u.nome = ANY($1::text[])`,
      [lst],
    )
    for (const r of rows) { const n = dec(r.nome); if (n) m.set(r.login, n) }
  } catch { /* usa login */ }
  return m
}

export interface TransacaoCartao {
  hora:            string
  nsu:             string | null
  valor:           number
  bandeira:        string
  frentista:       string
  frentista_login: string
}

// GET /api/caixa/cartoes?posto_id=&data=&operador=
export async function GET(req: Request) {
  const auth = await exigirRole(['master', 'adm_financeiro'])
  if (!auth.ok) return auth.resp

  const { searchParams } = new URL(req.url)
  const postoId = searchParams.get('posto_id')
  if (!postoId) return NextResponse.json({ error: 'posto_id obrigatório' }, { status: 400 })
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const data = searchParams.get('data') || hoje
  const fOperador = searchParams.get('operador')?.trim() || null

  const admin = createAdminClient()
  const { data: posto } = await admin
    .from('postos').select('codigo_empresa_externo').eq('id', postoId).maybeSingle()
  const emp = Number(posto?.codigo_empresa_externo)
  if (!emp) return NextResponse.json({ error: 'Posto sem empresa externa' }, { status: 400 })

  let rows: any[] = []
  try {
    rows = await queryAS<any>(
      `SELECT to_char(m.hora,'HH24:MI') hora,
              convert_to(coalesce(m.documento,''),'LATIN1') nsu,
              m.valor::float valor,
              convert_to(coalesce(mo.nome,''),'LATIN1') bandeira,
              convert_to(coalesce(m.usuario,''),'LATIN1') operador
         FROM movto m
         JOIN motivo_movto mo ON mo.grid = m.motivo
        WHERE m.empresa = $1 AND m.data = $2
          AND mo.nome ILIKE ANY($3::text[])
          AND coalesce(m.usuario,'') NOT IN ('PDV','SYSTEM','SISTEMA','AUTOSYSTEM')
        ORDER BY m.hora`,
      [emp, data, FILTRO_CARTAO],
    )
  } catch (e: any) {
    return NextResponse.json({ error: 'AUTOSYSTEM indisponível: ' + (e?.message ?? '') }, { status: 502 })
  }

  const nomes = await mapaNomes(rows.map(r => dec(r.operador)))
  const nomeDe = (l: string) => nomes.get(l) || l

  const transacoes: TransacaoCartao[] = rows
    .map(r => {
      const login = dec(r.operador)
      return {
        hora:            r.hora || '',
        nsu:             dec(r.nsu) || null,
        valor:           Number(r.valor) || 0,
        bandeira:        dec(r.bandeira),
        frentista:       nomeDe(login),
        frentista_login: login,
      }
    })
    .filter(t => !fOperador || t.frentista_login === fOperador)

  // Resumo por frentista
  const porFrentista = new Map<string, { login: string; nome: string; total: number; qtd: number }>()
  for (const t of transacoes) {
    const cur = porFrentista.get(t.frentista_login) ?? { login: t.frentista_login, nome: t.frentista, total: 0, qtd: 0 }
    cur.total += t.valor; cur.qtd += 1
    porFrentista.set(t.frentista_login, cur)
  }
  const resumo = [...porFrentista.values()]
    .map(x => ({ ...x, total: parseFloat(x.total.toFixed(2)) }))
    .sort((a, b) => b.total - a.total)

  // Lista de frentistas do dia (para o filtro) — de todas as transações, ignorando o filtro
  const frentistasFiltro = [...new Set(rows.map(r => dec(r.operador)))].filter(Boolean)
    .map(login => ({ login, nome: nomeDe(login) })).sort((a, b) => a.nome.localeCompare(b.nome))

  return NextResponse.json({
    transacoes,
    resumo,
    frentistas: frentistasFiltro,
    total_dia: parseFloat(transacoes.reduce((s, t) => s + t.valor, 0).toFixed(2)),
    qtd_dia: transacoes.length,
    data,
  })
}
