import { NextResponse } from 'next/server'
import { exigirRole } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// POST /api/caixa/conciliacao/baixar — marca (ou desmarca) um grupo como já
// baixado no AUTOSYSTEM. A baixa em si é feita no ERP; aqui só registramos o
// acompanhamento para o dono saber o que já foi baixado.
export async function POST(req: Request) {
  const auth = await exigirRole(['master', 'adm_financeiro', 'operador_conciliador'])
  if (!auth.ok) return auth.resp

  const body = await req.json().catch(() => null)
  const { conta_id, grupo_id, baixado } = body ?? {}
  if (!conta_id || !grupo_id) return NextResponse.json({ error: 'conta_id e grupo_id são obrigatórios' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('conciliacao_manual')
    .update({
      baixado_em:  baixado ? new Date().toISOString() : null,
      baixado_por: baixado ? auth.user.id : null,
    })
    .eq('conta_bancaria_id', conta_id)
    .eq('grupo_id', grupo_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
