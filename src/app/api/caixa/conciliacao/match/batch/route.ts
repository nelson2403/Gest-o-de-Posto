import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { exigirRole } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type Linha = { id: string; data?: string | null; valor?: number | null; descricao?: string | null }
type Grupo = { banco: Linha[]; sistema: Linha[] }

// POST /api/caixa/conciliacao/match/batch — cria VÁRIOS grupos de uma vez
// (usado pela auto-conciliação por soma). Cada grupo vira um grupo_id.
export async function POST(req: Request) {
  const auth = await exigirRole(['master'])
  if (!auth.ok) return auth.resp

  const body = await req.json().catch(() => null)
  const { conta_id, posto_id, grupos } = body ?? {}
  const lista: Grupo[] = Array.isArray(grupos) ? grupos : []
  if (!conta_id || lista.length === 0) return NextResponse.json({ error: 'conta_id e grupos são obrigatórios' }, { status: 400 })

  const admin = createAdminClient()

  // Remove vínculos anteriores de todas as linhas envolvidas.
  const bancoIds = lista.flatMap(g => g.banco.map(l => l.id))
  const sistemaIds = lista.flatMap(g => g.sistema.map(l => l.id))
  if (bancoIds.length) await admin.from('conciliacao_manual').delete().eq('conta_bancaria_id', conta_id).eq('lado', 'banco').in('linha_hash', bancoIds)
  if (sistemaIds.length) await admin.from('conciliacao_manual').delete().eq('conta_bancaria_id', conta_id).eq('lado', 'sistema').in('linha_hash', sistemaIds)

  const rows: any[] = []
  const criados: { grupo_id: string; banco: string[]; sistema: string[] }[] = []
  for (const g of lista) {
    if (!g.banco?.length || !g.sistema?.length) continue
    const grupo_id = randomUUID()
    criados.push({ grupo_id, banco: g.banco.map(l => l.id), sistema: g.sistema.map(l => l.id) })
    for (const l of g.banco) rows.push(linha(conta_id, posto_id, grupo_id, 'banco', l, auth.user.id))
    for (const l of g.sistema) rows.push(linha(conta_id, posto_id, grupo_id, 'sistema', l, auth.user.id))
  }
  if (!rows.length) return NextResponse.json({ criados: [] })

  const { error } = await admin.from('conciliacao_manual').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ criados })
}

function linha(conta_id: string, posto_id: string | null, grupo_id: string, lado: string, l: Linha, uid: string) {
  return {
    conta_bancaria_id: conta_id,
    posto_id:          posto_id ?? null,
    grupo_id,
    lado,
    linha_hash:        l.id,
    linha_data:        l.data ?? null,
    linha_valor:       l.valor ?? null,
    linha_descricao:   l.descricao ?? null,
    conciliado_por:    uid,
  }
}
