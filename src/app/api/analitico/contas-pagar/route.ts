import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buscarTitulosPagar } from '@/lib/autosystem'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const vencto_ini = searchParams.get('vencto_ini')
  const vencto_fim = searchParams.get('vencto_fim')

  const hoje = new Date()
  const hojeStr = hoje.toISOString().slice(0, 10)
  const ini = vencto_ini ?? new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10)
  const fim = vencto_fim ?? new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10)

  const admin = createAdminClient()
  const { data: postos } = await admin
    .from('postos')
    .select('id, nome, codigo_empresa_externo')
    .not('codigo_empresa_externo', 'is', null)
    .eq('ativo', true)

  if (!postos?.length) {
    return NextResponse.json({ postos: [], totais: { total: 0, a_vencer: 0, em_atraso: 0, pago: 0, qt: 0, qt_atraso: 0 } })
  }

  const results = await Promise.all(
    postos.map(async (posto) => {
      try {
        const movtos = await buscarTitulosPagar(parseInt(posto.codigo_empresa_externo!), ini, fim, 'todas')
        const titulos = (movtos as any[]).map((m: any) => {
          const vencto = m.vencto as string
          const child = m.child ?? 0
          const sit = child > 0 ? 'pago' : vencto < hojeStr ? 'em_atraso' : 'a_vencer'
          return { valor: m.valor ?? 0, situacao: sit }
        })
        const total     = parseFloat(titulos.reduce((s: number, t: any) => s + t.valor, 0).toFixed(2))
        const a_vencer  = parseFloat(titulos.filter((t: any) => t.situacao === 'a_vencer').reduce((s: number, t: any) => s + t.valor, 0).toFixed(2))
        const em_atraso = parseFloat(titulos.filter((t: any) => t.situacao === 'em_atraso').reduce((s: number, t: any) => s + t.valor, 0).toFixed(2))
        const pago      = parseFloat(titulos.filter((t: any) => t.situacao === 'pago').reduce((s: number, t: any) => s + t.valor, 0).toFixed(2))
        return {
          posto_id: posto.id, posto_nome: posto.nome,
          total, a_vencer, em_atraso, pago,
          qt: titulos.length,
          qt_atraso: titulos.filter((t: any) => t.situacao === 'em_atraso').length,
        }
      } catch {
        return { posto_id: posto.id, posto_nome: posto.nome, total: 0, a_vencer: 0, em_atraso: 0, pago: 0, qt: 0, qt_atraso: 0 }
      }
    })
  )

  const postoResults = results.filter(r => r.qt > 0).sort((a, b) => b.total - a.total)
  const totais = {
    total:      parseFloat(postoResults.reduce((s, r) => s + r.total,     0).toFixed(2)),
    a_vencer:   parseFloat(postoResults.reduce((s, r) => s + r.a_vencer,  0).toFixed(2)),
    em_atraso:  parseFloat(postoResults.reduce((s, r) => s + r.em_atraso, 0).toFixed(2)),
    pago:       parseFloat(postoResults.reduce((s, r) => s + r.pago,      0).toFixed(2)),
    qt:         postoResults.reduce((s, r) => s + r.qt,       0),
    qt_atraso:  postoResults.reduce((s, r) => s + r.qt_atraso, 0),
  }

  return NextResponse.json({ postos: postoResults, totais })
}
