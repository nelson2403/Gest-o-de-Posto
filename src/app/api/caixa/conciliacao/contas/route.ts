import { NextResponse } from 'next/server'
import { exigirRole } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// GET /api/caixa/conciliacao/contas?posto_id=UUID — contas bancárias do posto
// (via admin, sem depender de RLS no client).
export async function GET(req: Request) {
  const auth = await exigirRole(['master', 'adm_financeiro', 'operador_conciliador'])
  if (!auth.ok) return auth.resp

  const postoId = new URL(req.url).searchParams.get('posto_id')
  if (!postoId) return NextResponse.json({ contas: [] })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('contas_bancarias')
    .select('id, banco, conta')
    .eq('posto_id', postoId)
    .order('banco')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ contas: data ?? [] })
}
