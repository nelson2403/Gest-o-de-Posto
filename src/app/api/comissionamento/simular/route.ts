import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { carregarRegrasDoEsquema } from '@/lib/comissionamento/data-loader'
import { simularRegrasVerbose } from '@/lib/comissionamento'
import type { Venda } from '@/lib/comissionamento'

export const dynamic = 'force-dynamic'

// POST /api/comissionamento/simular
//
// Body: {
//   esquema_id:           string  (uuid)
//   venda:                VendaSintetica (campos opcionais; quantidade/valor_total obrigatórios)
//   atingimento_meta?:    number  (% override para condições de atingimento)
// }
//
// Retorna: { simulacao: SimulacaoVenda } com o trace de todas as regras
// avaliadas, qual ganhou e quanto comissionou.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Partial<{
    esquema_id:        string
    venda:             Partial<Venda>
    atingimento_meta:  number
  }>

  if (!body.esquema_id) return NextResponse.json({ error: 'esquema_id é obrigatório' }, { status: 400 })
  const v = body.venda ?? {}
  if (typeof v.quantidade  !== 'number') return NextResponse.json({ error: 'venda.quantidade é obrigatório' },  { status: 400 })
  if (typeof v.valor_total !== 'number') return NextResponse.json({ error: 'venda.valor_total é obrigatório' }, { status: 400 })

  try {
    const regras = await carregarRegrasDoEsquema(body.esquema_id)

    // Monta uma venda completa preenchendo defaults
    const vendaSintetica: Venda = {
      grid:                 v.grid ?? 0,
      empresa_id:           v.empresa_id ?? 0,
      data:                 v.data ?? new Date().toISOString().slice(0, 10),
      vendedor_id:          v.vendedor_id ?? null,
      vendedor_nome:        v.vendedor_nome ?? null,
      cargo:                v.cargo ?? null,
      produto:              v.produto ?? 0,
      produto_nome:         v.produto_nome ?? '',
      produto_tipo:         v.produto_tipo ?? null,
      grupo_produto:        v.grupo_produto ?? null,
      subgrupo_produto:     v.subgrupo_produto ?? null,
      quantidade:           v.quantidade,
      valor_total:          v.valor_total,
      custo_medio_unitario: v.custo_medio_unitario ?? 0,
    }

    const simulacao = simularRegrasVerbose({
      venda:               vendaSintetica,
      regras,
      atingimentoOverride: body.atingimento_meta ?? null,
    })

    return NextResponse.json({ simulacao })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao simular'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
