import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type EsquemaStatus = 'rascunho' | 'ativo' | 'inativo'

export interface Esquema {
  id:             string
  nome:           string
  descricao:      string
  status:         EsquemaStatus
  criado_em:      string
  atualizado_em:  string
  qtd_regras?:    number
  qtd_ativas?:    number
  posto_ids?:     string[]
}

const STATUS_VALIDOS: readonly EsquemaStatus[] = ['rascunho', 'ativo', 'inativo']

// ─── GET — lista esquemas com contagem de regras ────────────────────────────
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const [esqResp, regResp, vincResp] = await Promise.all([
    admin.from('comissio_esquemas').select('*').order('criado_em', { ascending: false }),
    admin.from('comissio_regras').select('esquema_id, status'),
    admin.from('comissio_esquema_postos').select('esquema_id, posto_id'),
  ])

  if (esqResp.error) return NextResponse.json({ error: esqResp.error.message }, { status: 500 })

  // Calcula qtd_regras / qtd_ativas por esquema
  const contagens = new Map<string, { total: number; ativas: number }>()
  for (const r of regResp.data ?? []) {
    const cur = contagens.get(r.esquema_id) ?? { total: 0, ativas: 0 }
    cur.total += 1
    if (r.status === 'ativo') cur.ativas += 1
    contagens.set(r.esquema_id, cur)
  }

  // posto_ids por esquema
  const postosPorEsquema = new Map<string, string[]>()
  for (const v of vincResp.data ?? []) {
    const lista = postosPorEsquema.get(v.esquema_id) ?? []
    lista.push(v.posto_id as string)
    postosPorEsquema.set(v.esquema_id, lista)
  }

  const esquemas: Esquema[] = (esqResp.data ?? []).map((e: any) => ({
    ...e,
    qtd_regras: contagens.get(e.id)?.total  ?? 0,
    qtd_ativas: contagens.get(e.id)?.ativas ?? 0,
    posto_ids:  postosPorEsquema.get(e.id) ?? [],
  }))

  return NextResponse.json({ esquemas })
}

// ─── POST — cria esquema ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Partial<{
    nome: string; descricao: string; status: EsquemaStatus
  }>

  if (!body.nome?.trim()) {
    return NextResponse.json({ error: 'nome é obrigatório' }, { status: 400 })
  }
  if (body.status && !STATUS_VALIDOS.includes(body.status)) {
    return NextResponse.json({ error: `status inválido — use ${STATUS_VALIDOS.join(', ')}` }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('comissio_esquemas')
    .insert({
      nome:       body.nome.trim(),
      descricao:  body.descricao?.trim() ?? '',
      status:     body.status ?? 'rascunho',
      criado_por: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ esquema: data })
}
