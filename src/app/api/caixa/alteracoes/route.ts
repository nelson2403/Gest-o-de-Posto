import { NextResponse } from 'next/server'
import { exigirRole } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { queryAS } from '@/lib/autosystem'

export const dynamic = 'force-dynamic'

const dec = (b: unknown) => (b && Buffer.isBuffer(b) ? (b as Buffer).toString('latin1') : (b == null ? '' : String(b)))

export interface AlteracaoCaixa {
  tipo:          'insercao' | 'exclusao' | 'alteracao'
  quando:        string          // pgd_when (quando a mudança foi feita)
  alterou:       string          // pgd_username (quem mexeu)
  operador:      string          // usuario (frentista dono do caixa)
  terceiro:      boolean         // alterou != operador → outra pessoa mexeu no caixa
  dia:           string | null   // data do movto (dia do caixa)
  motivo:        string          // nome do motivo
  valor:         number | null
  valor_antes:   number | null   // para alterações
  documento:     string | null
  mlid:          string | null
}

// GET /api/caixa/alteracoes?posto_id=&data_ini=&data_fim=&operador=&alterou=&tipo=&so_terceiros=
export async function GET(req: Request) {
  const auth = await exigirRole(['master', 'adm_financeiro'])
  if (!auth.ok) return auth.resp

  const { searchParams } = new URL(req.url)
  const postoId = searchParams.get('posto_id')
  if (!postoId) return NextResponse.json({ error: 'posto_id obrigatório' }, { status: 400 })

  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const seteDias = new Date(Date.now() - 6 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const dataIni = searchParams.get('data_ini') || seteDias
  const dataFim = searchParams.get('data_fim') || hoje
  const fOperador   = searchParams.get('operador')?.trim() || null
  const fAlterou    = searchParams.get('alterou')?.trim() || null
  const fTipo       = searchParams.get('tipo')?.trim() || null           // insercao|exclusao|alteracao
  const soTerceiros = searchParams.get('so_terceiros') === '1'

  const admin = createAdminClient()
  const { data: posto } = await admin
    .from('postos').select('codigo_empresa_externo').eq('id', postoId).maybeSingle()
  const emp = Number(posto?.codigo_empresa_externo)
  if (!emp) return NextResponse.json({ error: 'Posto sem empresa externa' }, { status: 400 })

  let rows: any[] = []
  try {
    rows = await queryAS<any>(
      `SELECT mf.pgd_optype op, mf.pgd_when quando,
              convert_to(coalesce(mf.pgd_username,''),'LATIN1') alterou,
              convert_to(coalesce(mf.usuario,''),'LATIN1')     operador,
              to_char(mf.data,'YYYY-MM-DD') dia, mf.valor::float valor,
              mf.mlid, mf.pgd_gfid,
              convert_to(coalesce(mf.documento,''),'LATIN1') documento,
              convert_to(coalesce(mo.nome,''),'LATIN1') motivo
         FROM movto_flow mf
         LEFT JOIN motivo_movto mo ON mo.grid = mf.motivo
        WHERE mf.empresa = $1 AND mf.data BETWEEN $2 AND $3
        ORDER BY mf.pgd_when DESC
        LIMIT 4000`,
      [emp, dataIni, dataFim],
    )
  } catch (e: any) {
    return NextResponse.json({ error: 'AUTOSYSTEM indisponível: ' + (e?.message ?? '') }, { status: 502 })
  }

  // Pareia Uo (valor antigo) + Un (valor novo) do mesmo movto+instante → uma alteração
  const antesPorChave = new Map<string, number>()
  for (const r of rows) {
    if (r.op === 'Uo') antesPorChave.set(`${r.mlid}|${r.quando?.toISOString?.() ?? r.quando}`, Number(r.valor))
  }

  const operadoresSet = new Set<string>()
  const alterouSet    = new Set<string>()
  const alteracoes: AlteracaoCaixa[] = []

  for (const r of rows) {
    if (r.op === 'Uo') continue // é o "antes" — já pareado no Un
    const alterou  = dec(r.alterou)
    const operador = dec(r.operador)
    operadoresSet.add(operador)
    alterouSet.add(alterou)
    const tipo: AlteracaoCaixa['tipo'] =
      r.op === 'I' ? 'insercao' : r.op === 'D' ? 'exclusao' : 'alteracao'
    const chave = `${r.mlid}|${r.quando?.toISOString?.() ?? r.quando}`
    const terceiro = !!alterou && !!operador && alterou !== operador

    if (fTipo && tipo !== fTipo) continue
    if (fOperador && operador !== fOperador) continue
    if (fAlterou && alterou !== fAlterou) continue
    if (soTerceiros && !terceiro) continue

    alteracoes.push({
      tipo,
      quando:      typeof r.quando === 'string' ? r.quando : r.quando?.toISOString?.() ?? '',
      alterou, operador, terceiro,
      dia:         r.dia ?? null,
      motivo:      dec(r.motivo) || String(r.motivo ?? ''),
      valor:       r.valor == null ? null : Number(r.valor),
      valor_antes: tipo === 'alteracao' ? (antesPorChave.get(chave) ?? null) : null,
      documento:   dec(r.documento) || null,
      mlid:        r.mlid != null ? String(r.mlid) : null,
    })
  }

  return NextResponse.json({
    alteracoes: alteracoes.slice(0, 800),
    total: alteracoes.length,
    operadores: [...operadoresSet].filter(Boolean).sort(),
    usuarios:   [...alterouSet].filter(Boolean).sort(),
    periodo: { ini: dataIni, fim: dataFim },
  })
}
