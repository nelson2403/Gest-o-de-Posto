import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buscarGruposProduto } from '@/lib/autosystem'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const grupos = await buscarGruposProduto()
    return NextResponse.json(grupos)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao consultar grupos de produto'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
