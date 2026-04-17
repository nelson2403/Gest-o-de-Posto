import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/marketing/patrocinios/[id]/aprovar
// Body: { acao: 'aprovar' | 'reprovar', motivo?: string }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const { acao, motivo } = await req.json()

  if (!['aprovar', 'reprovar'].includes(acao)) {
    return NextResponse.json({ error: 'acao deve ser "aprovar" ou "reprovar"' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verifica role
  const { data: usr } = await admin.from('usuarios').select('role').eq('id', user.id).single()
  if (!usr || !['master', 'admin', 'marketing'].includes(usr.role)) {
    return NextResponse.json({ error: 'Sem permissão para aprovar patrocínios' }, { status: 403 })
  }

  const novoStatus = acao === 'aprovar' ? 'aprovado' : 'reprovado'

  const { data, error } = await admin
    .from('marketing_patrocinios')
    .update({
      status: novoStatus,
      aprovado_por: user.id,
      aprovado_em: new Date().toISOString(),
      motivo_reprovacao: acao === 'reprovar' ? (motivo ?? null) : null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('marketing_logs').insert({
    tipo: 'patrocinio', ref_id: id, acao: novoStatus,
    usuario_id: user.id, detalhes: { motivo }
  })

  return NextResponse.json({ patrocinio: data })
}
