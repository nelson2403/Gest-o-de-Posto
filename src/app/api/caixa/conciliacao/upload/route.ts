import { NextResponse } from 'next/server'
import { exigirRole } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { queryAS } from '@/lib/autosystem'
import { parseExtratoLinhas } from '@/lib/extrato-parser'
import type { LinhaBanco, LinhaSistema, Conciliacao } from '../route'

export const dynamic = 'force-dynamic'

const dec = (b: unknown) => (b && Buffer.isBuffer(b) ? (b as Buffer).toString('latin1') : (b == null ? '' : String(b)))

// POST /api/caixa/conciliacao/upload  (multipart: conta_id, file)
// Monta o D-Para usando um OFX enviado na hora (em vez do extrato anexado na
// tarefa). O período sai das próprias datas do OFX.
export async function POST(req: Request) {
  const auth = await exigirRole(['master', 'adm_financeiro', 'operador_conciliador'])
  if (!auth.ok) return auth.resp

  const form = await req.formData().catch(() => null)
  const contaId = form?.get('conta_id') as string | null
  const file = form?.get('file') as File | null
  if (!contaId || !file) return NextResponse.json({ error: 'conta_id e arquivo são obrigatórios' }, { status: 400 })

  const buf = await file.arrayBuffer()
  const isOFX = /OFXHEADER|<OFX>/i.test(new TextDecoder('latin1').decode(new Uint8Array(buf).slice(0, 512)))
  if (!isOFX) return NextResponse.json({ error: 'Envie o arquivo no formato OFX (é o mais detalhado).' }, { status: 422 })

  const linhas = parseExtratoLinhas(buf)
  if (!linhas.length) return NextResponse.json({ error: 'OFX sem transações. Verifique se é o extrato certo.' }, { status: 422 })

  // Período = intervalo das datas do próprio OFX
  const datas = linhas.map(l => l.data).sort()
  const dataIni = datas[0], dataFim = datas[datas.length - 1]

  const admin = createAdminClient()
  const { data: conta } = await admin
    .from('contas_bancarias')
    .select('id, codigo_conta_externo, conta, banco, posto_id, posto:postos(nome, codigo_empresa_externo)')
    .eq('id', contaId)
    .maybeSingle()
  if (!conta) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })
  const emp = Number((conta.posto as any)?.codigo_empresa_externo)
  const code = conta.codigo_conta_externo as string
  if (!emp || !code) return NextResponse.json({ error: 'Conta sem empresa/código externo' }, { status: 400 })

  // Linhas do banco (do OFX)
  const contadorHash = new Map<string, number>()
  const banco: LinhaBanco[] = linhas.map(l => {
    const base = `${l.data}|${l.valor.toFixed(2)}|${l.descricao}`
    const n = contadorHash.get(base) ?? 0
    contadorHash.set(base, n + 1)
    return { id: `${base}#${n}`, data: l.data, descricao: l.descricao || '—', valor: l.valor }
  }).sort((a, b) => a.data.localeCompare(b.data) || Math.abs(b.valor) - Math.abs(a.valor))

  // Linhas do AUTOSYSTEM (movto na conta corrente) no período do OFX
  let sistema: LinhaSistema[] = []
  try {
    const rows = await queryAS<any>(
      `SELECT m.grid, to_char(m.data,'YYYY-MM-DD') AS dt, m.conta_debitar AS deb, m.valor::float AS valor,
              convert_to(coalesce(mo.nome,''),'LATIN1') motivo, convert_to(coalesce(p.nome,''),'LATIN1') pessoa,
              convert_to(coalesce(m.obs,''),'LATIN1') obs, convert_to(coalesce(m.documento,''),'LATIN1') documento
         FROM movto m LEFT JOIN motivo_movto mo ON mo.grid = m.motivo LEFT JOIN pessoa p ON p.grid = m.pessoa
        WHERE m.empresa = $1 AND (m.conta_debitar = $2 OR m.conta_creditar = $2) AND m.data BETWEEN $3 AND $4
        ORDER BY m.data, m.grid`,
      [emp, code, dataIni, dataFim],
    )
    sistema = rows.map(r => {
      const entrada = r.deb === code
      const descricao = [dec(r.motivo), dec(r.pessoa), dec(r.obs)].filter(Boolean).join(' · ')
      return {
        id: String(r.grid), data: r.dt, descricao: descricao || dec(r.documento) || '—',
        documento: dec(r.documento) || null,
        valor: entrada ? Number(r.valor) : -Number(r.valor),
        direcao: (entrada ? 'entrada' : 'saida') as 'entrada' | 'saida',
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: 'AUTOSYSTEM indisponível: ' + (e?.message ?? '') }, { status: 502 })
  }

  let conciliacoes: Conciliacao[] = []
  try {
    const { data: ms, error } = await admin.from('conciliacao_manual').select('grupo_id, lado, linha_hash, baixado_em').eq('conta_bancaria_id', contaId)
    if (!error && ms) conciliacoes = ms as any
  } catch { /* migração 142 ainda não rodou */ }

  return NextResponse.json({
    conta: { id: conta.id, banco: conta.banco, numero: conta.conta, posto: (conta.posto as any)?.nome ?? '—', posto_id: conta.posto_id },
    periodo: { ini: dataIni, fim: dataFim },
    banco, sistema, conciliacoes,
    arquivos: { total: 1, lidos: 1, erro: 0 },
    origem: 'ofx',
  })
}
