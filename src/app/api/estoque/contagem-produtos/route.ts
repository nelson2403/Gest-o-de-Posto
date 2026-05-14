import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buscarEstoquePorGrupo } from '@/lib/autosystem'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresaId = Number(searchParams.get('empresaId'))
  const grupoId   = Number(searchParams.get('grupoId'))

  if (!empresaId || !grupoId) {
    return NextResponse.json({ error: 'Parâmetros ausentes' }, { status: 400 })
  }

  const produtos = await buscarEstoquePorGrupo(empresaId, grupoId)
  return NextResponse.json({ produtos })
}
