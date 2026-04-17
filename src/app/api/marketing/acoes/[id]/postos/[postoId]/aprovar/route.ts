import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/marketing/acoes/[id]/postos/[postoId]/aprovar
// Body: { acao: 'aprovar' | 'reprovar', motivo?: string }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; postoId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id: acaoId, postoId } = await params
  const { acao, motivo } = await req.json()

  if (!['aprovar', 'reprovar'].includes(acao)) {
    return NextResponse.json({ error: 'acao deve ser "aprovar" ou "reprovar"' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: usr } = await admin.from('usuarios').select('role').eq('id', user.id).single()
  if (!usr || !['master', 'admin', 'marketing'].includes(usr.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const novoStatus = acao === 'aprovar' ? 'aprovado' : 'reprovado'

  const { data, error } = await admin
    .from('marketing_acao_postos')
    .update({
      status: novoStatus,
      aprovado_por: user.id,
      aprovado_em: new Date().toISOString(),
      motivo_reprovacao: acao === 'reprovar' ? (motivo ?? null) : null,
    })
    .eq('acao_id', acaoId)
    .eq('posto_id', postoId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('marketing_logs').insert({
    tipo: 'acao', ref_id: data.id, acao: novoStatus,
    usuario_id: user.id, detalhes: { motivo, posto_id: postoId }
  })

  return NextResponse.json({ acao_posto: data })
}
