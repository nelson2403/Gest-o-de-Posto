import { NextResponse } from 'next/server'
import { exigirRole } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { queryAS } from '@/lib/autosystem'
import { parseExtratoLinhas, type LinhaExtrato } from '@/lib/extrato-parser'

export const dynamic = 'force-dynamic'

const dec = (b: unknown) => (b && Buffer.isBuffer(b) ? (b as Buffer).toString('latin1') : (b == null ? '' : String(b)))

export interface LinhaBanco { id: string; data: string; descricao: string; valor: number }
export interface LinhaSistema { id: string; data: string; descricao: string; documento: string | null; valor: number; direcao: 'entrada' | 'saida' }
export interface Conciliacao { grupo_id: string; lado: 'banco' | 'sistema'; linha_hash: string; baixado_em: string | null }
export interface CartaoLiquida { liquida: string; bandeira: string; venda: string; valor: number; qtd: number }

// Recebíveis de cartão que LIQUIDAM no período (vencto), com a data da VENDA e a
// bandeira — responde "de qual dia é o cartão que devo baixar". Só faz sentido em
// conta de adquirente (Stone etc.); em banco comum retorna vazio.
export async function cartoesLiquidando(emp: number, ini: string, fim: string): Promise<CartaoLiquida[]> {
  try {
    const rows = await queryAS<any>(
      `SELECT convert_to(coalesce(mo.nome,''),'LATIN1') bandeira,
              to_char(m.data,'YYYY-MM-DD') AS venda, to_char(m.vencto,'YYYY-MM-DD') AS liquida,
              sum(m.valor)::float AS valor, count(*) AS qtd
         FROM movto m JOIN motivo_movto mo ON mo.grid = m.motivo
        WHERE m.empresa = $1 AND m.vencto BETWEEN $2 AND $3
          AND (mo.nome ILIKE '%VISA%' OR mo.nome ILIKE '%MASTER%' OR mo.nome ILIKE '%ELO%'
               OR mo.nome ILIKE '%HIPER%' OR mo.nome ILIKE '%AMEX%' OR mo.nome ILIKE '%CART%')
          AND mo.nome NOT ILIKE 'RECEBIMENTO%' AND mo.nome NOT ILIKE 'AJUSTE%'
        GROUP BY 1, 2, 3 ORDER BY liquida, bandeira, venda`,
      [emp, ini, fim],
    )
    return rows.map(r => ({ liquida: r.liquida, bandeira: dec(r.bandeira), venda: r.venda, valor: Number(r.valor), qtd: Number(r.qtd) }))
  } catch { return [] }
}

const EH_ADQUIRENTE = (banco: string | null) => /stone|cielo|rede|getnet|pagseguro|mercado|adquir|cart/i.test(String(banco || ''))

// GET /api/caixa/conciliacao?conta_id=UUID&data_ini=YYYY-MM-DD&data_fim=YYYY-MM-DD
export async function GET(req: Request) {
  const auth = await exigirRole(['master', 'adm_financeiro', 'operador_conciliador'])
  if (!auth.ok) return auth.resp

  const { searchParams } = new URL(req.url)
  const contaId = searchParams.get('conta_id')
  const dataIni = searchParams.get('data_ini')
  const dataFim = searchParams.get('data_fim')
  if (!contaId || !dataIni || !dataFim) {
    return NextResponse.json({ error: 'conta_id, data_ini e data_fim são obrigatórios' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: conta } = await admin
    .from('contas_bancarias')
    .select('id, codigo_conta_externo, conta, banco, posto_id, posto:postos(nome, codigo_empresa_externo)')
    .eq('id', contaId)
    .maybeSingle()
  if (!conta) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })

  const emp  = Number((conta.posto as any)?.codigo_empresa_externo)
  const code = conta.codigo_conta_externo as string
  if (!emp || !code) return NextResponse.json({ error: 'Conta sem empresa/código externo' }, { status: 400 })

  // ── Linhas do AUTOSYSTEM (movto na conta corrente) ────────────────────────
  let sistema: LinhaSistema[] = []
  try {
    const rows = await queryAS<any>(
      `SELECT m.grid, to_char(m.data,'YYYY-MM-DD') AS dt, m.conta_debitar AS deb, m.valor::float AS valor,
              convert_to(coalesce(mo.nome,''),'LATIN1') motivo,
              convert_to(coalesce(p.nome,''),'LATIN1')  pessoa,
              convert_to(coalesce(m.obs,''),'LATIN1')   obs,
              convert_to(coalesce(m.documento,''),'LATIN1') documento
         FROM movto m
         LEFT JOIN motivo_movto mo ON mo.grid = m.motivo
         LEFT JOIN pessoa p        ON p.grid  = m.pessoa
        WHERE m.empresa = $1 AND (m.conta_debitar = $2 OR m.conta_creditar = $2)
          AND m.data BETWEEN $3 AND $4
        ORDER BY m.data, m.grid`,
      [emp, code, dataIni, dataFim],
    )
    sistema = rows.map(r => {
      const entrada = r.deb === code
      const descricao = [dec(r.motivo), dec(r.pessoa), dec(r.obs)].filter(Boolean).join(' · ')
      return {
        id: String(r.grid),
        data: r.dt,
        descricao: descricao || dec(r.documento) || '—',
        documento: dec(r.documento) || null,
        valor: entrada ? Number(r.valor) : -Number(r.valor),
        direcao: (entrada ? 'entrada' : 'saida') as 'entrada' | 'saida',
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: 'AUTOSYSTEM indisponível: ' + (e?.message ?? '') }, { status: 502 })
  }

  // ── Linhas do banco (extratos anexados nas tarefas de conciliação) ────────
  const { data: recs } = await admin.from('tarefas_recorrentes').select('id').eq('conta_bancaria_id', contaId)
  const recIds = (recs ?? []).map((r: any) => r.id)
  let arquivos: { path: string }[] = []
  if (recIds.length) {
    const { data: ts } = await admin
      .from('tarefas')
      .select('extrato_arquivo_path, extrato_data')
      .in('tarefa_recorrente_id', recIds)
      .eq('categoria', 'conciliacao_bancaria')
      .not('extrato_arquivo_path', 'is', null)
      .gte('extrato_data', dataIni)
      .lte('extrato_data', dataFim)
    const paths = new Set<string>()
    for (const t of ts ?? []) if (t.extrato_arquivo_path) paths.add(t.extrato_arquivo_path as string)
    arquivos = [...paths].map(p => ({ path: p }))
  }

  const banco: LinhaBanco[] = []
  const contadorHash = new Map<string, number>()
  let arquivosLidos = 0, arquivosErro = 0
  for (const a of arquivos) {
    try {
      const { data: blob, error } = await admin.storage.from('extratos-bancarios').download(a.path)
      if (error || !blob) { arquivosErro++; continue }
      const buf = await blob.arrayBuffer()
      const linhas: LinhaExtrato[] = parseExtratoLinhas(buf)
      arquivosLidos++
      for (const l of linhas) {
        if (l.data < dataIni || l.data > dataFim) continue
        const base = `${l.data}|${l.valor.toFixed(2)}|${l.descricao}`
        const n = (contadorHash.get(base) ?? 0)
        contadorHash.set(base, n + 1)
        banco.push({ id: `${base}#${n}`, data: l.data, descricao: l.descricao || '—', valor: l.valor })
      }
    } catch { arquivosErro++ }
  }
  // dedupe: mesma linha pode vir em arquivos que se sobrepõem
  const vistos = new Set<string>()
  const bancoUnico = banco.filter(l => { if (vistos.has(l.id)) return false; vistos.add(l.id); return true })
  bancoUnicoSort(bancoUnico)

  // ── Conciliações já salvas (tolera tabela ainda não migrada) ──────────────
  let conciliacoes: Conciliacao[] = []
  try {
    const { data: ms, error } = await admin
      .from('conciliacao_manual')
      .select('grupo_id, lado, linha_hash, baixado_em')
      .eq('conta_bancaria_id', contaId)
    if (!error && ms) conciliacoes = ms as any
  } catch { /* migração 142 ainda não rodou */ }

  const cartoes = EH_ADQUIRENTE(conta.banco) ? await cartoesLiquidando(emp, dataIni, dataFim) : []

  return NextResponse.json({
    conta: { id: conta.id, banco: conta.banco, numero: conta.conta, posto: (conta.posto as any)?.nome ?? '—', posto_id: conta.posto_id },
    periodo: { ini: dataIni, fim: dataFim },
    banco: bancoUnico,
    sistema,
    conciliacoes,
    cartoes,
    arquivos: { total: arquivos.length, lidos: arquivosLidos, erro: arquivosErro },
  })
}

function bancoUnicoSort(l: LinhaBanco[]) {
  l.sort((a, b) => a.data.localeCompare(b.data) || Math.abs(b.valor) - Math.abs(a.valor))
}
