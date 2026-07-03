import { NextResponse } from 'next/server'
import { exigirRole } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { queryAS } from '@/lib/autosystem'

export const dynamic = 'force-dynamic'

const dec = (b: unknown) => (b && Buffer.isBuffer(b) ? (b as Buffer).toString('latin1') : (b == null ? '' : String(b)))

// Usuários "de sistema" (não são pessoas) — não contam como alteração de usuário.
const USUARIOS_SISTEMA = new Set(['PDV', 'SYSTEM', 'SISTEMA', 'AUTOSYSTEM'])

export interface CampoDetalhe { campo: string; antes: string | null; depois: string | null; mudou: boolean }
export interface AlteracaoCaixa {
  tipo:           'insercao' | 'exclusao' | 'alteracao'
  quando:         string
  alterou:        string
  operador:       string
  operador_login: string
  terceiro:       boolean
  estacao:        string
  documento:      string | null
  valor:          number | null
  campos:         CampoDetalhe[]
}

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
  } catch { /* usa o login */ }
  return m
}

const fmtVal = (v: number | null | undefined) => v == null ? null : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

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
  const fOperador   = searchParams.get('operador')?.trim() || null
  const fAlterou    = searchParams.get('alterou')?.trim() || null
  const fTipo       = searchParams.get('tipo')?.trim() || null
  const soTerceiros = searchParams.get('so_terceiros') === '1'

  const admin = createAdminClient()
  const { data: posto } = await admin
    .from('postos').select('codigo_empresa_externo').eq('id', postoId).maybeSingle()
  const emp = Number(posto?.codigo_empresa_externo)
  if (!emp) return NextResponse.json({ error: 'Posto sem empresa externa' }, { status: 400 })

  // Frentistas do dia (operadores dos movimentos)
  let frentistasLogins: string[] = []
  try {
    const fr = await queryAS<{ usuario: string }>(
      `SELECT DISTINCT convert_to(coalesce(usuario,''),'LATIN1') usuario
         FROM movto WHERE empresa=$1 AND data BETWEEN $2 AND $3 AND usuario IS NOT NULL`,
      [emp, dataIni, dataFim],
    )
    frentistasLogins = fr.map(r => dec(r.usuario)).filter(u => u && !USUARIOS_SISTEMA.has(u))
  } catch { /* segue */ }

  // Alterações (movto_flow) — SEM o usuário de sistema "PDV"
  let rows: any[] = []
  try {
    rows = await queryAS<any>(
      `SELECT mf.pgd_optype op, mf.pgd_when quando, mf.pgd_gfid gfid, mf.mlid, mf.grid rgrid,
              convert_to(coalesce(mf.pgd_username,''),'LATIN1') alterou,
              convert_to(coalesce(mf.usuario,''),'LATIN1')     operador,
              convert_to(coalesce(mf.estacao,''),'LATIN1')     estacao,
              to_char(mf.data_doc,'DD/MM/YYYY') data_doc, to_char(mf.vencto,'DD/MM/YYYY') vencto,
              mf.valor::float valor, mf.pessoa,
              convert_to(coalesce(mf.obs,''),'LATIN1') obs,
              convert_to(coalesce(mf.documento,''),'LATIN1') documento,
              convert_to(coalesce(mo.nome,''),'LATIN1') forma_pgto
         FROM movto_flow mf
         LEFT JOIN motivo_movto mo ON mo.grid = mf.motivo
        WHERE mf.empresa = $1 AND mf.data BETWEEN $2 AND $3
          AND coalesce(mf.pgd_username,'') NOT IN ('PDV','SYSTEM','SISTEMA','AUTOSYSTEM')
        ORDER BY mf.pgd_when DESC
        LIMIT 8000`,
      [emp, dataIni, dataFim],
    )
  } catch (e: any) {
    return NextResponse.json({ error: 'AUTOSYSTEM indisponível: ' + (e?.message ?? '') }, { status: 502 })
  }

  // Nomes das pessoas (campo "Pessoa" do lançamento)
  const pessoaIds = [...new Set(rows.map(r => r.pessoa).filter((p: any) => p != null))]
  const pessoaNome = new Map<string, string>()
  if (pessoaIds.length) {
    try {
      const pr = await queryAS<{ grid: string; nome: string }>(
        `SELECT grid, convert_to(coalesce(nome,''),'LATIN1') nome FROM pessoa WHERE grid = ANY($1::bigint[])`,
        [pessoaIds],
      )
      for (const p of pr) pessoaNome.set(String(p.grid), dec(p.nome))
    } catch { /* ignora */ }
  }

  const nomes = await mapaNomes([...frentistasLogins, ...rows.map(r => dec(r.operador)), ...rows.map(r => dec(r.alterou))])
  const nomeDe = (login: string) => nomes.get(login) || login

  // Agrupa pelo REGISTRO individual (grid) + instante → um evento (I / D / Uo+Un).
  // (mlid é o documento e agrupa várias linhas — venda + pagamentos — misturando tudo.)
  const grupos = new Map<string, any[]>()
  for (const r of rows) {
    const k = `${r.rgrid ?? r.mlid}|${r.quando?.toISOString?.() ?? r.quando}`
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k)!.push(r)
  }

  const registro = (r: any) => ({
    'Forma de pagamento': dec(r.forma_pgto) || null,
    'Pessoa':             r.pessoa != null ? (pessoaNome.get(String(r.pessoa)) || String(r.pessoa)) : null,
    'Valor':              fmtVal(r.valor),
    'Data do documento':  r.data_doc || null,
    'Vencimento':         r.vencto || null,
    'Observação':         dec(r.obs) || null,
    'Documento':          dec(r.documento) || null,
  })
  const CAMPOS = ['Forma de pagamento', 'Pessoa', 'Valor', 'Data do documento', 'Vencimento', 'Observação', 'Documento']

  const alteracoes: AlteracaoCaixa[] = []
  for (const grp of grupos.values()) {
    // dedupe por gfid
    const uniq = Array.from(new Map(grp.map(r => [r.gfid, r])).values())
    const i  = uniq.find(r => r.op === 'I')
    const d  = uniq.find(r => r.op === 'D')
    const un = uniq.find(r => r.op === 'Un')
    const uo = uniq.find(r => r.op === 'Uo')
    const ref = i || un || d || uo
    if (!ref) continue

    const tipo: AlteracaoCaixa['tipo'] = i ? 'insercao' : d ? 'exclusao' : 'alteracao'
    const alterou = dec(ref.alterou), operador = dec(ref.operador)
    const terceiro = !!alterou && !!operador && alterou !== operador

    if (fTipo && tipo !== fTipo) continue
    if (fOperador && operador !== fOperador) continue
    if (fAlterou && alterou !== fAlterou) continue
    if (soTerceiros && !terceiro) continue

    const depoisRec = tipo === 'exclusao' ? null : registro(i || un)
    const antesRec  = tipo === 'insercao' ? null : registro(d ? d : uo)
    const campos: CampoDetalhe[] = CAMPOS.map(campo => {
      const antes  = antesRec  ? (antesRec  as any)[campo] : null
      const depois = depoisRec ? (depoisRec as any)[campo] : null
      return { campo, antes, depois, mudou: (antes ?? '') !== (depois ?? '') }
    }).filter(c => c.antes != null || c.depois != null)

    alteracoes.push({
      tipo,
      quando:         typeof ref.quando === 'string' ? ref.quando : ref.quando?.toISOString?.() ?? '',
      alterou:        nomeDe(alterou),
      operador:       nomeDe(operador),
      operador_login: operador,
      terceiro,
      estacao:        dec(ref.estacao) || '',
      documento:      dec(ref.documento) || null,
      valor:          ref.valor == null ? null : Number(ref.valor),
      campos,
    })
  }

  alteracoes.sort((a, b) => b.quando.localeCompare(a.quando))

  const frentistas = [...new Set([...frentistasLogins, ...rows.map(r => dec(r.operador))])]
    .filter(l => l && !USUARIOS_SISTEMA.has(l)).map(login => ({ login, nome: nomeDe(login) })).sort((a, b) => a.nome.localeCompare(b.nome))
  const usuarios = [...new Set(rows.map(r => dec(r.alterou)))]
    .filter(l => l && !USUARIOS_SISTEMA.has(l)).map(login => ({ login, nome: nomeDe(login) })).sort((a, b) => a.nome.localeCompare(b.nome))

  return NextResponse.json({
    alteracoes: alteracoes.slice(0, 1500),
    total: alteracoes.length,
    frentistas, usuarios,
    periodo: { ini: dataIni, fim: dataFim },
  })
}
