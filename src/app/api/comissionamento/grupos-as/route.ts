import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buscarGrupos, buscarSubgrupos } from '@/lib/autosystem'

// GET /api/comissionamento/grupos-as
// Retorna grupos e subgrupos de produto do AUTOSYSTEM para uso nos filtros
// de meta (filtro_tipo = 'grupo_produto' | 'subgrupo_produto').
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const [grupos, subgrupos] = await Promise.all([buscarGrupos(), buscarSubgrupos()])
    return NextResponse.json({ grupos, subgrupos })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao consultar AUTOSYSTEM'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
