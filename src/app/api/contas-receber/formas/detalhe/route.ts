import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/contas-receber/formas/detalhe?conta=1.3.01.160&mes=2026-04&empresa=...
// Returns individual transactions for a specific account+month.
// Payment rule: child = 0 → Em Aberto, child <> 0 → Baixado
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const conta     = searchParams.get('conta')
  const mes       = searchParams.get('mes')   // YYYY-MM
  const empresaId = searchParams.get('empresa')

  if (!conta || !mes) return NextResponse.json({ error: 'Parâmetros obrigatórios: conta, mes' }, { status: 400 })

  const admin = createAdminClient()

  const { data: postos } = await admin
    .from('postos')
    .select('id, nome, codigo_empresa_externo')
    .not('codigo_empresa_externo', 'is', null)

  const postoMap: Record<string, string> = {}
  for (const p of postos ?? []) {
    if (p.codigo_empresa_externo) postoMap[p.codigo_empresa_externo] = p.nome
  }

  const empresaIds = (empresaId ? [empresaId] : Object.keys(postoMap)).map(Number)
  if (!empresaIds.length) return NextResponse.json({ transacoes: [] })

  const [ano, mesNum] = mes.split('-').map(Number)
  const ultimoDia = new Date(ano, mesNum, 0).getDate()
  const dataIni   = `${mes}-01`
  const dataFim   = `${mes}-${String(ultimoDia).padStart(2, '0')}`

  const isMotivoKey = conta.startsWith('motivo:')
  const motivoGrid  = isMotivoKey ? parseInt(conta.replace('motivo:', '')) : null

  let movtos: any[] = []

  if (isMotivoKey && motivoGrid) {
    // Movimentos por motivo — usa data no lugar de vencto
    const { data, error } = await admin
      .from('as_movto')
      .select('data, documento, tipo_doc, valor, empresa, child, motivo')
      .in('empresa', empresaIds)
      .eq('motivo', motivoGrid)
      .gte('data', dataIni)
      .lte('data', dataFim)
      .order('data', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    movtos = (data ?? []).map(m => ({
      vencto:     m.data,
      data:       m.data,
      documento:  m.documento,
      tipo_doc:   m.tipo_doc,
      valor:      m.valor,
      empresa:    String(m.empresa),
      child:      m.child,
      pago:       m.child !== null && m.child !== 0,
      data_baixa: null, // não disponível sem join confiável por mlid
      posto_nome: postoMap[String(m.empresa)] ?? String(m.empresa),
    }))
  } else {
    // Movimentos por conta contábil
    const { data, error } = await admin
      .from('as_movto')
      .select('vencto, data, documento, tipo_doc, valor, empresa, child, pessoa')
      .in('empresa', empresaIds)
      .eq('conta_debitar', conta)
      .gte('vencto', dataIni)
      .lte('vencto', dataFim)
      .order('vencto', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Pessoas lookup
    const pessoaIds = [...new Set((data ?? []).map(m => m.pessoa).filter(Boolean))] as number[]
    const pessoaLookup: Record<number, string> = {}
    if (pessoaIds.length) {
      const { data: pessoas } = await admin.from('as_pessoa').select('grid, nome').in('grid', pessoaIds)
      for (const p of pessoas ?? []) pessoaLookup[p.grid] = p.nome ?? '(sem cliente)'
    }

    // data_baixa: best-effort lookup pelo mlid do registro de baixa
    // child > 0 → mlid do registro que baixou
    const childMlids = [...new Set((data ?? []).map(m => m.child).filter(c => c && c > 0))] as number[]
    const baixaLookup: Record<number, string> = {}
    if (childMlids.length) {
      const { data: baixas } = await admin
        .from('as_movto')
        .select('mlid, data')
        .in('mlid', childMlids)
        .not('mlid', 'is', null)
      for (const b of baixas ?? []) {
        if (b.mlid && !baixaLookup[b.mlid]) baixaLookup[b.mlid] = b.data
      }
    }

    movtos = (data ?? []).map(m => ({
      vencto:      m.vencto,
      data:        m.data,
      documento:   m.documento,
      tipo_doc:    m.tipo_doc,
      valor:       m.valor,
      empresa:     String(m.empresa),
      child:       m.child,
      pago:        m.child !== null && m.child !== 0,
      data_baixa:  (m.child && m.child > 0) ? (baixaLookup[m.child] ?? null) : null,
      pessoa_nome: m.pessoa ? (pessoaLookup[m.pessoa] ?? '(sem cliente)') : '(sem cliente)',
      posto_nome:  postoMap[String(m.empresa)] ?? String(m.empresa),
    })).sort((a, b) => (a.pessoa_nome ?? '').localeCompare(b.pessoa_nome ?? '') || a.vencto?.localeCompare(b.vencto ?? '') || 0)
  }

  return NextResponse.json({ transacoes: movtos })
}
