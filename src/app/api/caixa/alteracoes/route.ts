import { NextResponse } from 'next/server'
import { exigirRole } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { queryAS } from '@/lib/autosystem'

export const dynamic = 'force-dynamic'

const dec = (b: unknown) => (b && Buffer.isBuffer(b) ? (b as Buffer).toString('latin1') : (b == null ? '' : String(b)))

export interface AlteracaoCaixa {
  tipo:          'insercao' | 'exclusao' | 'alteracao'
  quando:        string
  alterou:       string          // nome de quem mexeu
  operador:      string          // nome do frentista dono do caixa
  operador_login: string
  terceiro:      boolean
  dia:           string | null
  motivo:        string
  valor:         number | null
  valor_antes:   number | null
  documento:     string | null
  mlid:          string | null
}

// Mapa login → nome completo (usuario.nome = login → usuario.pessoa → pessoa.nome)
async function mapaNomes(logins: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  const lst = [...new Set(logins.filter(Boolean))]
  if (!lst.length) return m
  try {
    const rows = await queryAS<{ login: string; nome: string }>(
      `SELECT u.nome AS login, convert_to(coalesce(p.nome,''),'LATIN1') AS nome
         FROM usuario u LEFT JOIN pessoa p ON p.grid = u.pessoa
        WHERE u.nome = ANY($1::text[])`,
      [lst],
    )
    for (const r of rows) { const nome = dec(r.nome); if (nome) m.set(r.login, nome) }
  } catch { /* sem mapa — usa o login */ }
  return m
}

// GET /api/caixa/alteracoes?posto_id=&data_ini=&data_fim=&operador=&alterou=&tipo=&so_terceiros=
export async function GET(req: Request) {
  const auth = await exigirRole(['master', 'adm_financeiro'])
  if (!auth.ok) return auth.resp

  const { searchParams } = new URL(req.url)
  const postoId = searchParams.get('posto_id')
  if (!postoId) return NextResponse.json({ error: 'posto_id obrigatório' }, { status: 400 })

  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const dataIni = searchParams.get('data_ini') || hoje
  const dataFim = searchParams.get('data_fim') || hoje
  const fOperador   = searchParams.get('operador')?.trim() || null   // login do frentista
  const fAlterou    = searchParams.get('alterou')?.trim() || null    // login de quem alterou
  const fTipo       = searchParams.get('tipo')?.trim() || null
  const soTerceiros = searchParams.get('so_terceiros') === '1'

  const admin = createAdminClient()
  const { data: posto } = await admin
    .from('postos').select('codigo_empresa_externo').eq('id', postoId).maybeSingle()
  const emp = Number(posto?.codigo_empresa_externo)
  if (!emp) return NextResponse.json({ error: 'Posto sem empresa externa' }, { status: 400 })

  // 1) TODOS os frentistas do dia (operadores dos movimentos), com nome completo
  let frentistasLogins: string[] = []
  try {
    const fr = await queryAS<{ usuario: string }>(
      `SELECT DISTINCT convert_to(coalesce(usuario,''),'LATIN1') AS usuario
         FROM movto WHERE empresa=$1 AND data BETWEEN $2 AND $3 AND usuario IS NOT NULL`,
      [emp, dataIni, dataFim],
    )
    frentistasLogins = fr.map(r => dec(r.usuario)).filter(Boolean)
  } catch { /* segue sem a lista completa */ }

  // 2) Alterações (movto_flow)
  let rows: any[] = []
  try {
    rows = await queryAS<any>(
      `SELECT mf.pgd_optype op, mf.pgd_when quando,
              convert_to(coalesce(mf.pgd_username,''),'LATIN1') alterou,
              convert_to(coalesce(mf.usuario,''),'LATIN1')     operador,
              to_char(mf.data,'YYYY-MM-DD') dia, mf.valor::float valor, mf.mlid,
              convert_to(coalesce(mf.documento,''),'LATIN1') documento,
              convert_to(coalesce(mo.nome,''),'LATIN1') motivo
         FROM movto_flow mf
         LEFT JOIN motivo_movto mo ON mo.grid = mf.motivo
        WHERE mf.empresa = $1 AND mf.data BETWEEN $2 AND $3
        ORDER BY mf.pgd_when DESC
        LIMIT 6000`,
      [emp, dataIni, dataFim],
    )
  } catch (e: any) {
    return NextResponse.json({ error: 'AUTOSYSTEM indisponível: ' + (e?.message ?? '') }, { status: 502 })
  }

  // Mapa de nomes p/ todos os logins que aparecem
  const nomes = await mapaNomes([
    ...frentistasLogins,
    ...rows.map(r => dec(r.operador)),
    ...rows.map(r => dec(r.alterou)),
  ])
  const nomeDe = (login: string) => nomes.get(login) || login

  // Pareia Uo (antes) + Un (depois)
  const antes = new Map<string, number>()
  for (const r of rows) if (r.op === 'Uo') antes.set(`${r.mlid}|${r.quando?.toISOString?.() ?? r.quando}`, Number(r.valor))

  const alteracoes: AlteracaoCaixa[] = []
  for (const r of rows) {
    if (r.op === 'Uo') continue
    const opLogin = dec(r.operador)
    const altLogin = dec(r.alterou)
    const tipo: AlteracaoCaixa['tipo'] = r.op === 'I' ? 'insercao' : r.op === 'D' ? 'exclusao' : 'alteracao'
    const terceiro = !!altLogin && !!opLogin && altLogin !== opLogin
    if (fTipo && tipo !== fTipo) continue
    if (fOperador && opLogin !== fOperador) continue
    if (fAlterou && altLogin !== fAlterou) continue
    if (soTerceiros && !terceiro) continue
    const chave = `${r.mlid}|${r.quando?.toISOString?.() ?? r.quando}`
    alteracoes.push({
      tipo,
      quando:        typeof r.quando === 'string' ? r.quando : r.quando?.toISOString?.() ?? '',
      alterou:       nomeDe(altLogin),
      operador:      nomeDe(opLogin),
      operador_login: opLogin,
      terceiro,
      dia:           r.dia ?? null,
      motivo:        dec(r.motivo) || String(r.motivo ?? ''),
      valor:         r.valor == null ? null : Number(r.valor),
      valor_antes:   tipo === 'alteracao' ? (antes.get(chave) ?? null) : null,
      documento:     dec(r.documento) || null,
      mlid:          r.mlid != null ? String(r.mlid) : null,
    })
  }

  // Frentistas (todos do dia) + quem alterou, com nome — para os selects
  const frentistas = [...new Set([...frentistasLogins, ...rows.map(r => dec(r.operador))])]
    .filter(Boolean).map(login => ({ login, nome: nomeDe(login) })).sort((a, b) => a.nome.localeCompare(b.nome))
  const usuarios = [...new Set(rows.map(r => dec(r.alterou)))]
    .filter(Boolean).map(login => ({ login, nome: nomeDe(login) })).sort((a, b) => a.nome.localeCompare(b.nome))

  return NextResponse.json({
    alteracoes: alteracoes.slice(0, 1200),
    total: alteracoes.length,
    frentistas, usuarios,
    periodo: { ini: dataIni, fim: dataFim },
  })
}
