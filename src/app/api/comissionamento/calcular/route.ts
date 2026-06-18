import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcularComissoes } from '@/lib/comissionamento'

export const dynamic = 'force-dynamic'

// GET /api/comissionamento/calcular
//   ?posto_id=<uuid>
//   &esquema_id=<uuid>
//   &data_ini=YYYY-MM-DD
//   &data_fim=YYYY-MM-DD
//
// Aplica o esquema indicado ao período/posto informado e retorna:
//   • totais (KPIs)
//   • resumoPorVendedor (uma entrada por vendedor com faturamento, comissão e atingimentos)
//   • vendasComissionadas (uma entrada por venda — pesado, omitido por padrão)
//
// Use `?detalhe=1` para incluir o array completo de vendas comissionadas.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const postoId   = searchParams.get('posto_id')   ?? ''
  const esquemaId = searchParams.get('esquema_id') ?? ''
  const dataIni   = searchParams.get('data_ini')   ?? ''
  const dataFim   = searchParams.get('data_fim')   ?? ''
  const detalhe   = searchParams.get('detalhe') === '1'

  if (!postoId)   return NextResponse.json({ error: 'posto_id é obrigatório'   }, { status: 400 })
  if (!esquemaId) return NextResponse.json({ error: 'esquema_id é obrigatório' }, { status: 400 })
  if (!dataIni)   return NextResponse.json({ error: 'data_ini é obrigatório'   }, { status: 400 })
  if (!dataFim)   return NextResponse.json({ error: 'data_fim é obrigatório'   }, { status: 400 })

  try {
    const out = await calcularComissoes({
      postoId, esquemaId, dataIni, dataFim,
    })

    const body: Record<string, unknown> = {
      postoId:           out.postoId,
      esquemaId:         out.esquemaId,
      dataIni:           out.dataIni,
      dataFim:           out.dataFim,
      totais:            out.totais,
      resumoPorVendedor: out.resumoPorVendedor,
      atingimentos:      out.atingimentos,
      qtdRegras:         out.regras.length,
      qtdMetas:          out.metas.length,
      qtdMembros:        out.membros.length,
    }
    if (detalhe) {
      // Modelo novo (migration 093): comissão agregada por vendedor com
      // lista de regras que casaram. Substitui `vendasComissionadas`.
      body.comissaoPorVendedor = out.comissaoPorVendedor
    }
    return NextResponse.json(body)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao calcular comissões'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
