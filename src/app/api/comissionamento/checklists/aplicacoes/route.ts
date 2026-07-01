import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// GET  /api/comissionamento/checklists/aplicacoes?posto_id=&template_id=
// POST /api/comissionamento/checklists/aplicacoes
//   Cria uma aplicação para (template, posto, período). Cria também
//   respostas em branco para todos os itens do template — evita que a
//   UI precise fazer INSERTs individuais.

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const postoId    = sp.get('posto_id')
  const templateId = sp.get('template_id')

  const admin = createAdminClient()
  let q = admin
    .from('comissio_checklists_aplicacoes')
    .select('id, template_id, posto_id, period_start, period_end, total_pontos, observacoes, criado_em')
    .order('period_start', { ascending: false })
    .order('criado_em',    { ascending: false })
  if (postoId)    q = q.eq('posto_id',    postoId)
  if (templateId) q = q.eq('template_id', templateId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ aplicacoes: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Partial<{
    template_id:  string
    posto_id:     string
    period_start: string
    period_end:   string
    observacoes:  string
  }>

  if (!body.template_id)  return NextResponse.json({ error: 'template_id é obrigatório' }, { status: 400 })
  if (!body.posto_id)     return NextResponse.json({ error: 'posto_id é obrigatório' }, { status: 400 })
  if (!body.period_start) return NextResponse.json({ error: 'period_start é obrigatório' }, { status: 400 })
  if (!body.period_end)   return NextResponse.json({ error: 'period_end é obrigatório' }, { status: 400 })

  const admin = createAdminClient()

  // Confirma o template existe + pega itens
  const { data: itens, error: erI } = await admin
    .from('comissio_checklists_itens')
    .select('id')
    .eq('template_id', body.template_id)
  if (erI) return NextResponse.json({ error: erI.message }, { status: 500 })
  if (!itens || itens.length === 0) {
    return NextResponse.json({ error: 'Template sem itens — cadastre itens antes de aplicar' }, { status: 400 })
  }

  // Cria a aplicação (UNIQUE constraint impede duplicata)
  const { data: aplic, error: erA } = await admin
    .from('comissio_checklists_aplicacoes')
    .insert({
      template_id:  body.template_id,
      posto_id:     body.posto_id,
      period_start: body.period_start,
      period_end:   body.period_end,
      observacoes:  body.observacoes ?? '',
      supervisor_user_id: user.id,
      criado_por:   user.id,
    })
    .select()
    .single()
  if (erA || !aplic) {
    const msg = erA?.message ?? 'Falha ao criar aplicação'
    const status = msg.toLowerCase().includes('duplicate') ? 409 : 500
    return NextResponse.json({ error: msg }, { status })
  }

  // Cria respostas em branco (ok=false, motivo="") para cada item
  const respostas = itens.map(it => ({
    aplicacao_id: aplic.id, item_id: it.id, ok: false, motivo: '',
  }))
  const { error: erR } = await admin.from('comissio_checklists_respostas').insert(respostas)
  if (erR) {
    await admin.from('comissio_checklists_aplicacoes').delete().eq('id', aplic.id)
    return NextResponse.json({ error: erR.message }, { status: 500 })
  }

  return NextResponse.json({ aplicacao: aplic })
}
