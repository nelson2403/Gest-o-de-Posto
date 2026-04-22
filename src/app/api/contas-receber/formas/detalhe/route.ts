import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buscarMovtosDetalhe, buscarMovtosMotivoDetalhe, buscarMovtosContrapartida, buscarMlidsLiquidados, buscarPessoas } from '@/lib/autosystem'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const conta     = searchParams.get('conta')
  const mes       = searchParams.get('mes')
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
    const data = await buscarMovtosMotivoDetalhe(empresaIds, motivoGrid, dataIni, dataFim)
    movtos = (data as any[]).map(m => ({
      vencto:     m.data,
      data:       m.data,
      documento:  m.documento,
      tipo_doc:   m.tipo_doc,
      valor:      m.valor,
      empresa:    String(m.empresa),
      child:      m.child,
      pago:       (m.child as number) > 0,
      data_baixa: null,
      posto_nome: postoMap[String(m.empresa)] ?? String(m.empresa),
    }))
  } else {
    const data = await buscarMovtosDetalhe(empresaIds, conta, { dataIni, dataFim }) as any[]

    const pessoaIds = [...new Set(data.map((m: any) => m.pessoa).filter(Boolean))] as number[]
    const pessoaLookup: Record<number, string> = {}
    if (pessoaIds.length) {
      const pessoas = await buscarPessoas(pessoaIds)
      for (const p of pessoas) pessoaLookup[p.grid] = p.nome ?? '(sem cliente)'
    }

    const childMlids = [...new Set(data.map((m: any) => m.child).filter((c: any) => c && c > 0))] as number[]
    const baixaLookup: Record<number, string> = {}
    if (childMlids.length) {
      const baixas = await buscarMovtosContrapartida(childMlids) as any[]
      for (const b of baixas) {
        if (b.mlid && !baixaLookup[b.mlid]) baixaLookup[b.mlid] = b.data
      }
    }

    // For child=0 entries (Stone/card), detect settlements via credit counterpart (mlid match)
    const mlidsChildZero = [...new Set(data.filter((m: any) => (m.child as number) === 0 && m.mlid).map((m: any) => Number(m.mlid)))]
    const liquidadosSet = new Set(await buscarMlidsLiquidados(mlidsChildZero))

    // Also look up baixa dates for child=0 liquidados via mlid
    const baixasPorMlid: Record<number, string> = {}
    if (mlidsChildZero.length) {
      const baixas = await buscarMovtosContrapartida(mlidsChildZero) as any[]
      for (const b of baixas) {
        if (b.mlid && b.conta_creditar && String(b.conta_creditar).startsWith('1.3.') && !baixasPorMlid[Number(b.mlid)]) {
          baixasPorMlid[Number(b.mlid)] = b.data
        }
      }
    }

    movtos = data.map((m: any) => {
      const childPago     = (m.child as number) > 0
      const childZeroPago = (m.child as number) === 0 && liquidadosSet.has(Number(m.mlid))
      const pago          = childPago || childZeroPago
      const data_baixa    = childPago
        ? (baixaLookup[m.child] ?? null)
        : childZeroPago ? (baixasPorMlid[Number(m.mlid)] ?? null) : null
      return {
        vencto:      m.vencto,
        data:        m.data,
        documento:   m.documento,
        tipo_doc:    m.tipo_doc,
        valor:       m.valor,
        empresa:     String(m.empresa),
        child:       m.child,
        pago,
        data_baixa,
        pessoa_nome: m.pessoa ? (pessoaLookup[m.pessoa] ?? '(sem cliente)') : '(sem cliente)',
        posto_nome:  postoMap[String(m.empresa)] ?? String(m.empresa),
      }
    }).sort((a: any, b: any) => (a.pessoa_nome ?? '').localeCompare(b.pessoa_nome ?? '') || a.vencto?.localeCompare(b.vencto ?? '') || 0)
  }

  return NextResponse.json({ transacoes: movtos })
}
