import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { buscarItensNfe } from '@/lib/autosystem'

// GET — retorna os itens da NF-e lidos do XML do AS
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { data: tarefa } = await supabase
      .from('fiscal_tarefas')
      .select('nfe_resumo_grid')
      .eq('id', id)
      .single()

    if (!tarefa?.nfe_resumo_grid) return NextResponse.json({ itens: [] })

    const itens = await buscarItensNfe(Number(tarefa.nfe_resumo_grid))
    return NextResponse.json({ itens })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
