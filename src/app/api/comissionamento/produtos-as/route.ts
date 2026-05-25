import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buscarProdutosAs } from '@/lib/autosystem'

// GET /api/comissionamento/produtos-as?busca=...
// Lista produtos do AUTOSYSTEM (até 200) para o ConditionBuilder do
// comissionamento. Aceita parâmetro `busca` para filtrar por nome.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const sp    = new URL(req.url).searchParams
  const busca = sp.get('busca') ?? undefined

  try {
    const produtos = await buscarProdutosAs(busca)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[produtos-as] busca="${busca ?? ''}" → ${produtos.length} resultado(s)`)
    }
    return NextResponse.json({ produtos })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao consultar AUTOSYSTEM'
    console.error('[produtos-as] erro:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
