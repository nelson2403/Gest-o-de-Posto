import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST — salva ou atualiza medições para uma data
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()
  const { data, medicoes } = body as {
    data: string
    medicoes: { tanque_id: string; posto_nome: string; medida_litros: number | null }[]
  }

  if (!data || !Array.isArray(medicoes)) {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
  }

  const admin = createAdminClient()

  const rows = medicoes.map(m => ({
    tanque_id:     m.tanque_id,
    posto_nome:    m.posto_nome,
    data,
    medida_litros: m.medida_litros,
    usuario_id:    user.id,
    criado_em:     new Date().toISOString(),
  }))

  const { error } = await admin
    .from('medicoes_tanques')
    .upsert(rows, { onConflict: 'tanque_id,data' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, saved: rows.length })
}
