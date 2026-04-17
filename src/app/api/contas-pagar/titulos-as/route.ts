import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/contas-pagar/titulos-as?posto_id=&vencto_ini=&vencto_fim=&situacao=
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const posto_id   = searchParams.get('posto_id')
  const vencto_ini = searchParams.get('vencto_ini')
  const vencto_fim = searchParams.get('vencto_fim')
  const situacao   = searchParams.get('situacao') ?? 'todas'

  if (!posto_id) return NextResponse.json({ error: 'posto_id obrigatório' }, { status: 400 })

  const admin = createAdminClient()
  const { data: posto } = await admin
    .from('postos')
    .select('codigo_empresa_externo, nome')
    .eq('id', posto_id)
    .single()

  if (!posto?.codigo_empresa_externo)
    return NextResponse.json({ error: 'Posto sem código externo configurado' }, { status: 400 })

  const hoje = new Date().toISOString().slice(0, 10)
  const ini = vencto_ini ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  const fim = vencto_fim ?? new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10)

  const empresaGrid = parseInt(posto.codigo_empresa_externo)

  // Busca movtos com conta_creditar = '2.1.1' (contas a pagar)
  let q = admin
    .from('as_movto')
    .select('mlid, vencto, documento, valor, obs, child, motivo, pessoa')
    .eq('empresa', empresaGrid)
    .eq('conta_creditar', '2.1.1')
    .gte('vencto', ini)
    .lte('vencto', fim)

  // Filtro de situação
  if (situacao === 'a_vencer')  q = q.eq('child', 0).gte('vencto', hoje)
  if (situacao === 'em_atraso') q = q.eq('child', 0).lt('vencto', hoje)
  if (situacao === 'pago')      q = q.gt('child', 0)
  if (situacao === 'aberto')    q = q.eq('child', 0)

  const { data: movtos, error } = await q.order('vencto', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Pessoa lookup
  const pessoaIds = [...new Set((movtos ?? []).map(m => m.pessoa).filter(Boolean))] as number[]
  const pessoaLookup: Record<number, string> = {}
  if (pessoaIds.length) {
    const { data: pessoas } = await admin.from('as_pessoa').select('grid, nome').in('grid', pessoaIds)
    for (const p of pessoas ?? []) pessoaLookup[p.grid] = p.nome ?? '(sem nome)'
  }

  // Motivo lookup
  const motivoIds = [...new Set((movtos ?? []).map(m => m.motivo).filter(Boolean))] as number[]
  const motivoLookup: Record<number, string> = {}
  if (motivoIds.length) {
    const { data: motivos } = await admin.from('as_motivo_movto').select('grid, nome').in('grid', motivoIds)
    for (const m of motivos ?? []) motivoLookup[m.grid] = m.nome ?? ''
  }

  const titulos = (movtos ?? []).map(m => {
    const child = m.child ?? 0
    const vencto = m.vencto as string
    const sit = child > 0 ? 'pago' : vencto < hoje ? 'em_atraso' : 'a_vencer'
    return {
      mlid:        m.mlid,
      vencto,
      documento:   m.documento,
      valor:       m.valor,
      obs:         m.obs,
      child,
      pessoa_nome: m.pessoa ? (pessoaLookup[m.pessoa] ?? '(sem nome)') : null,
      motivo_nome: m.motivo ? (motivoLookup[m.motivo] ?? null) : null,
      situacao:    sit,
    }
  })

  const totais = {
    total:        parseFloat(titulos.reduce((s, t) => s + (t.valor ?? 0), 0).toFixed(2)),
    a_vencer:     parseFloat(titulos.filter(t => t.situacao === 'a_vencer').reduce((s, t) => s + (t.valor ?? 0), 0).toFixed(2)),
    em_atraso:    parseFloat(titulos.filter(t => t.situacao === 'em_atraso').reduce((s, t) => s + (t.valor ?? 0), 0).toFixed(2)),
    pago:         parseFloat(titulos.filter(t => t.situacao === 'pago').reduce((s, t) => s + (t.valor ?? 0), 0).toFixed(2)),
    qt_total:     titulos.length,
    qt_a_vencer:  titulos.filter(t => t.situacao === 'a_vencer').length,
    qt_em_atraso: titulos.filter(t => t.situacao === 'em_atraso').length,
    qt_pago:      titulos.filter(t => t.situacao === 'pago').length,
  }

  return NextResponse.json({ titulos, totais, posto: posto.nome })
}
