import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// GET /api/comissionamento/metas/grupos/[id]/esquemas-do-posto
//
// Retorna os esquemas de comissionamento que contêm o posto do grupo
// indicado + a lista de postos vinculados a cada esquema. Usado no modal
// "Duplicar em rede" para o usuário escolher pra qual esquema replicar
// (comum: 1 só; mas se o posto está em vários, dá pra decidir).

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id: grupoId } = await ctx.params
  const admin = createAdminClient()

  // 1. Descobre posto_id do grupo
  const { data: grupo, error: erG } = await admin
    .from('comissio_metas_grupos')
    .select('posto_id')
    .eq('id', grupoId)
    .single()
  if (erG || !grupo) return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 })

  const postoOrigemId = grupo.posto_id as string

  // 2. Descobre esquemas que contêm esse posto
  const { data: vinculos, error: erV } = await admin
    .from('comissio_esquema_postos')
    .select('esquema_id')
    .eq('posto_id', postoOrigemId)
  if (erV) return NextResponse.json({ error: erV.message }, { status: 500 })
  const esquemaIds = Array.from(new Set((vinculos ?? []).map(v => v.esquema_id as string)))

  if (esquemaIds.length === 0) {
    return NextResponse.json({ posto_origem_id: postoOrigemId, esquemas: [] })
  }

  // 3. Para cada esquema: nome + lista de postos vinculados
  const [esquemasResp, postosResp] = await Promise.all([
    admin.from('comissio_esquemas').select('id, nome, status').in('id', esquemaIds),
    admin.from('comissio_esquema_postos').select('esquema_id, posto_id').in('esquema_id', esquemaIds),
  ])
  if (esquemasResp.error) return NextResponse.json({ error: esquemasResp.error.message }, { status: 500 })
  if (postosResp.error)   return NextResponse.json({ error: postosResp.error.message },   { status: 500 })

  const postosPorEsquema = new Map<string, string[]>()
  for (const v of postosResp.data ?? []) {
    const eid = v.esquema_id as string
    const pid = v.posto_id   as string
    const arr = postosPorEsquema.get(eid) ?? []
    arr.push(pid)
    postosPorEsquema.set(eid, arr)
  }

  // Nomes de postos
  const todosPostoIds = Array.from(new Set(Array.from(postosPorEsquema.values()).flat()))
  const { data: postosData } = await admin
    .from('postos')
    .select('id, nome')
    .in('id', todosPostoIds)
  const nomePosto = new Map<string, string>()
  for (const p of postosData ?? []) nomePosto.set(p.id as string, p.nome as string)

  const esquemas = (esquemasResp.data ?? []).map(e => {
    const postoIds = postosPorEsquema.get(e.id as string) ?? []
    return {
      id:     e.id,
      nome:   e.nome,
      status: e.status,
      postos: postoIds.map(pid => ({ id: pid, nome: nomePosto.get(pid) ?? '(sem nome)' })),
    }
  })

  return NextResponse.json({ posto_origem_id: postoOrigemId, esquemas })
}
