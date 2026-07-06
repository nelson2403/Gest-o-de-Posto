import { NextResponse } from 'next/server'
import { exigirRole } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { queryAS } from '@/lib/autosystem'

export const dynamic = 'force-dynamic'

const dec = (b: unknown) => (b && Buffer.isBuffer(b) ? (b as Buffer).toString('latin1') : (b == null ? '' : String(b)))

// Usuários "de sistema" (não são pessoas / são integração TEF-PDV) — não contam
// como alteração feita por um usuário e nem como frentista.
const USUARIOS_SISTEMA = new Set(['PDV', 'SYSTEM', 'SISTEMA', 'AUTOSYSTEM', 'lzt', 'LZT'])
const SISTEMA_SQL = "('PDV','SYSTEM','SISTEMA','AUTOSYSTEM','lzt','LZT')"

export interface CampoDetalhe { campo: string; antes: string | null; depois: string | null; mudou: boolean }
export interface AlteracaoCaixa {
  tipo:           'insercao' | 'exclusao' | 'alteracao'
  quando:         string
  alterou:        string
  alterou_login:  string
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

  // Conta(s) do PDV de COMBUSTÍVEL (nome "PDV - <posto>") — exclui loja, caixa
  // interno e contas inativas. É onde caem as vendas/recebimentos dos frentistas
  // de pista. É a conta que faz a lista bater com a Conferência de Caixa.
  let pdvContas: string[] = []
  try {
    const pc = await queryAS<{ c: string }>(
      `SELECT codigo c FROM conta
        WHERE nome ILIKE 'PDV%' AND nome NOT ILIKE '%LOJA%' AND nome NOT ILIKE '%INATIV%'`)
    pdvContas = pc.map(r => String(r.c)).filter(Boolean)
  } catch { /* usa fallback abaixo */ }
  const usaPdv = pdvContas.length > 0
  const scopeCaixa = (a: string) => usaPdv
    ? `(${a}.conta_debitar = ANY($4::text[]) OR ${a}.conta_creditar = ANY($4::text[]))`
    : `(${a}.conta_debitar LIKE '1.1.2.%' OR ${a}.conta_creditar LIKE '1.1.2.%')`
  const scopeParams: any[] = usaPdv ? [emp, dataIni, dataFim, pdvContas] : [emp, dataIni, dataFim]

  // Frentistas do dia = operadores (turno de caixa) dos movimentos no PDV de combustível.
  let frentLogins: string[] = []
  try {
    const fr = await queryAS<{ u: string }>(
      `SELECT DISTINCT convert_to(coalesce(usuario,''),'LATIN1') u
         FROM movto m WHERE empresa=$1 AND data BETWEEN $2 AND $3 AND usuario IS NOT NULL
          AND ${scopeCaixa('m')}
          AND coalesce(turno,0) > 0
          AND coalesce(usuario,'') NOT IN ${SISTEMA_SQL}`,
      scopeParams,
    )
    frentLogins = fr.map(r => dec(r.u)).filter(u => u && !USUARIOS_SISTEMA.has(u))
  } catch { /* segue */ }

  // Alterações (movto_flow) — só na conta do PDV de combustível, sem usuário de sistema
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
          AND coalesce(mf.pgd_username,'') NOT IN ${SISTEMA_SQL}
          AND ${scopeCaixa('mf')}
        ORDER BY mf.pgd_when DESC
        LIMIT 8000`,
      scopeParams,
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

  const nomes = await mapaNomes([...frentLogins, ...rows.map(r => dec(r.operador)), ...rows.map(r => dec(r.alterou))])
  const nomeDe = (login: string) => nomes.get(login) || login

  // Agrupa pelo REGISTRO individual (grid) + instante → um evento (I / D / Uo+Un).
  // (mlid é o documento e agrupa várias linhas — venda + pagamentos — misturando tudo.)
  const grupos = new Map<string, any[]>()
  for (const r of rows) {
    const k = `${r.rgrid ?? r.mlid}|${r.quando?.toISOString?.() ?? r.quando}`
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k)!.push(r)
  }

  const registro = (r: any): Record<string, string | null> | null => r ? ({
    'Forma de pagamento': dec(r.forma_pgto) || null,
    'Pessoa':             r.pessoa != null ? (pessoaNome.get(String(r.pessoa)) || String(r.pessoa)) : null,
    'Valor':              fmtVal(r.valor),
    'Data do documento':  r.data_doc || null,
    'Vencimento':         r.vencto || null,
    'Observação':         dec(r.obs) || null,
    'Documento':          dec(r.documento) || null,
  }) : null
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

    // "Alteração no caixa" = quando alguém mexe no lançamento de OUTRO (terceiro),
    // ou qualquer EXCLUSÃO. Operações do próprio operador (venda/edição da própria
    // conferência, muitas vezes re-gravação automática) NÃO contam — inflam a lista.
    if (!terceiro && tipo !== 'exclusao') continue

    const depoisRec = tipo === 'exclusao' ? null : registro(i || un)
    const antesRec  = tipo === 'insercao' ? null : registro(d ? d : uo)
    const campos: CampoDetalhe[] = CAMPOS.map(campo => {
      const antes  = antesRec  ? (antesRec  as any)[campo] : null
      const depois = depoisRec ? (depoisRec as any)[campo] : null
      // Mudança na OBSERVAÇÃO não conta como alteração do caixa — é só a nota de
      // conciliação que a retaguarda (financeiro) grava. Só forma/valor/pessoa/
      // documento/datas caracterizam uma mexida real no lançamento.
      const mudou = campo !== 'Observação' && (antes ?? '') !== (depois ?? '')
      return { campo, antes, depois, mudou }
    }).filter(c => c.antes != null || c.depois != null)

    // Alteração que não mexeu em nenhum campo relevante (só re-gravou / mudou nota)
    // = re-gravação automática da retaguarda → não é uma alteração de verdade.
    if (tipo === 'alteracao' && !campos.some(c => c.mudou)) continue

    alteracoes.push({
      tipo,
      quando:         typeof ref.quando === 'string' ? ref.quando : ref.quando?.toISOString?.() ?? '',
      alterou:        nomeDe(alterou),
      alterou_login:  alterou,
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

  // Frentistas do dia = operadores do caixa (conta 1.1.2.%). "Quem alterou" = só
  // quem realmente fez alterações.
  const frentistas = [...new Set(frentLogins)]
    .map(login => ({ login, nome: nomeDe(login) })).sort((a, b) => a.nome.localeCompare(b.nome))
  const altSet = new Map<string, string>()
  for (const a of alteracoes) if (a.alterou_login && !USUARIOS_SISTEMA.has(a.alterou_login)) altSet.set(a.alterou_login, a.alterou)
  const usuarios = [...altSet].map(([login, nome]) => ({ login, nome })).sort((a, b) => a.nome.localeCompare(b.nome))

  // Aplica os filtros só no resultado (as listas acima continuam completas)
  const filtradas = alteracoes.filter(a =>
    (!fTipo || a.tipo === fTipo) &&
    (!fOperador || a.operador_login === fOperador) &&
    (!fAlterou || a.alterou_login === fAlterou) &&
    (!soTerceiros || a.terceiro))

  const resumo = {
    total:      filtradas.length,
    insercoes:  filtradas.filter(a => a.tipo === 'insercao').length,
    alteracoes: filtradas.filter(a => a.tipo === 'alteracao').length,
    exclusoes:  filtradas.filter(a => a.tipo === 'exclusao').length,
    terceiros:  filtradas.filter(a => a.terceiro).length,
  }

  return NextResponse.json({
    alteracoes: filtradas.slice(0, 1500),
    total: filtradas.length,
    resumo, frentistas, usuarios,
    periodo: { ini: dataIni, fim: dataFim },
  })
}
