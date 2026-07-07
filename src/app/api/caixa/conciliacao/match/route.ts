import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { exigirRole } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type Linha = { id: string; data?: string | null; valor?: number | null; descricao?: string | null }

// POST /api/caixa/conciliacao/match — cria um GRUPO ligando N linhas do banco a
// M linhas do sistema (ex.: 1 linha do banco = 2 baixas no sistema).
export async function POST(req: Request) {
  const auth = await exigirRole(['master'])
  if (!auth.ok) return auth.resp

  const body = await req.json().catch(() => null)
  const { conta_id, posto_id, banco, sistema } = body ?? {}
  const bancoLinhas: Linha[] = Array.isArray(banco) ? banco : []
  const sistemaLinhas: Linha[] = Array.isArray(sistema) ? sistema : []
  if (!conta_id || bancoLinhas.length === 0 || sistemaLinhas.length === 0) {
    return NextResponse.json({ error: 'Selecione ao menos uma linha do banco e uma do sistema.' }, { status: 400 })
  }

  const admin = createAdminClient()
  // Cada linha só pode estar em um grupo — remove vínculos anteriores das linhas escolhidas.
  const bancoIds = bancoLinhas.map(l => l.id)
  const sistemaIds = sistemaLinhas.map(l => l.id)
  await admin.from('conciliacao_manual').delete().eq('conta_bancaria_id', conta_id).eq('lado', 'banco').in('linha_hash', bancoIds)
  await admin.from('conciliacao_manual').delete().eq('conta_bancaria_id', conta_id).eq('lado', 'sistema').in('linha_hash', sistemaIds)

  const grupo_id = randomUUID()
  const linhas = [
    ...bancoLinhas.map(l => ({ lado: 'banco', l })),
    ...sistemaLinhas.map(l => ({ lado: 'sistema', l })),
  ].map(({ lado, l }) => ({
    conta_bancaria_id: conta_id,
    posto_id:          posto_id ?? null,
    grupo_id,
    lado,
    linha_hash:        l.id,
    linha_data:        l.data ?? null,
    linha_valor:       l.valor ?? null,
    linha_descricao:   l.descricao ?? null,
    conciliado_por:    auth.user.id,
  }))

  const { error } = await admin.from('conciliacao_manual').insert(linhas)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, grupo_id })
}

// DELETE /api/caixa/conciliacao/match — desfaz um grupo inteiro (por grupo_id)
export async function DELETE(req: Request) {
  const auth = await exigirRole(['master'])
  if (!auth.ok) return auth.resp

  const body = await req.json().catch(() => null)
  const { conta_id, grupo_id } = body ?? {}
  if (!conta_id || !grupo_id) return NextResponse.json({ error: 'conta_id e grupo_id são obrigatórios' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('conciliacao_manual').delete().eq('conta_bancaria_id', conta_id).eq('grupo_id', grupo_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
