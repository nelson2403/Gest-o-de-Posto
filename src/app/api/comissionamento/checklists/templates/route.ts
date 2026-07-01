import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// GET /api/comissionamento/checklists/templates
//   Lista templates com contagem de itens (e a soma dos pontos, útil pra UI).
// POST /api/comissionamento/checklists/templates
//   Cria template + itens numa transação lógica.

interface ItemInput { descricao: string; pontos: number; ordem?: number }

function validarItens(input: unknown): { ok: true; itens: ItemInput[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'itens deve ser um array' }
  const out: ItemInput[] = []
  for (let i = 0; i < input.length; i++) {
    const it = input[i] as Partial<ItemInput>
    if (typeof it?.descricao !== 'string' || it.descricao.trim() === '') {
      return { ok: false, error: `itens[${i}].descricao é obrigatória` }
    }
    const pontos = Number(it?.pontos)
    if (!Number.isFinite(pontos) || pontos <= 0) {
      return { ok: false, error: `itens[${i}].pontos deve ser > 0` }
    }
    out.push({
      descricao: it.descricao.trim(),
      pontos,
      ordem: Number(it.ordem ?? i),
    })
  }
  return { ok: true, itens: out }
}

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: templates, error } = await admin
    .from('comissio_checklists_template')
    .select('*, itens:comissio_checklists_itens(id, ordem, descricao, pontos)')
    .order('nome')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: templates ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Partial<{
    nome: string; descricao: string; itens: unknown
  }>

  if (!body.nome?.trim()) return NextResponse.json({ error: 'nome é obrigatório' }, { status: 400 })
  const vI = validarItens(body.itens ?? [])
  if (!vI.ok) return NextResponse.json({ error: vI.error }, { status: 400 })
  if (vI.itens.length === 0) return NextResponse.json({ error: 'template precisa ter ao menos 1 item' }, { status: 400 })

  const admin = createAdminClient()

  const { data: tpl, error: erT } = await admin
    .from('comissio_checklists_template')
    .insert({
      nome:      body.nome.trim(),
      descricao: body.descricao?.trim() ?? '',
      criado_por: user.id,
    })
    .select()
    .single()
  if (erT || !tpl) return NextResponse.json({ error: erT?.message ?? 'Falha ao criar template' }, { status: 500 })

  const itensPayload = vI.itens.map((it, i) => ({
    template_id: tpl.id,
    ordem:       it.ordem ?? i,
    descricao:   it.descricao,
    pontos:      it.pontos,
  }))
  const { error: erI } = await admin.from('comissio_checklists_itens').insert(itensPayload)
  if (erI) {
    await admin.from('comissio_checklists_template').delete().eq('id', tpl.id)
    return NextResponse.json({ error: erI.message }, { status: 500 })
  }

  return NextResponse.json({ template: { ...tpl, itens: itensPayload } })
}
