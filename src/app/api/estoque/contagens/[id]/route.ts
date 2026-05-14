import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { data: contagem, error } = await supabase
    .from('contagens_estoque')
    .select('*, contagens_estoque_itens(*)')
    .eq('id', id)
    .single()

  if (error || !contagem) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ contagem })
}
