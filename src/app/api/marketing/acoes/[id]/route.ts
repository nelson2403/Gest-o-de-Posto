import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ROLES = ['master', 'adm_marketing']

async function autorizar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado', status: 401 as const }
  const { data: u } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
  if (!u || !ROLES.includes(u.role)) return { erro: 'Sem permissão', status: 403 as const }
  return { user }
}

// PUT — edita a ação e reconcilia os postos (adiciona novos / remove os pendentes sem comprovante)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autorizar()
  if ('erro' in auth) return NextResponse.json({ error: auth.erro }, { status: auth.status })

  const { id } = await params
  const { titulo, descricao, valor_padrao, data_acao, prazo_envio, postos } = await req.json()
  if (!titulo || !data_acao || !prazo_envio) {
    return NextResponse.json({ error: 'Campos obrigatórios: titulo, data_acao, prazo_envio' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { error: errUpd } = await admin
    .from('marketing_acoes')
    .update({ titulo, descricao: descricao ?? null, valor_padrao: Number(valor_padrao) || 150, data_acao, prazo_envio })
    .eq('id', id)
  if (errUpd) return NextResponse.json({ error: errUpd.message }, { status: 500 })

  // Reconcilia os postos participantes
  let adicionados = 0, removidos = 0, protegidos = 0
  if (Array.isArray(postos)) {
    const { data: existentes } = await admin
      .from('marketing_acao_postos')
      .select('id, posto_id, status, marketing_comprovantes(id)')
      .eq('acao_id', id)

    const existSet = new Set((existentes ?? []).map((e: any) => e.posto_id))

    // Adiciona os postos novos
    const novos = (postos as string[]).filter(p => !existSet.has(p))
    if (novos.length) {
      const { error } = await admin.from('marketing_acao_postos').insert(novos.map(posto_id => ({ acao_id: id, posto_id })))
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      adicionados = novos.length
    }

    // Remove os que saíram da lista — só se ainda estiverem pendentes e sem comprovante
    const candidatosRemover = (existentes ?? []).filter((e: any) => !(postos as string[]).includes(e.posto_id))
    const removerIds = candidatosRemover
      .filter((e: any) => e.status === 'pendente' && (!e.marketing_comprovantes || e.marketing_comprovantes.length === 0))
      .map((e: any) => e.id)
    protegidos = candidatosRemover.length - removerIds.length
    if (removerIds.length) {
      await admin.from('marketing_acao_postos').delete().in('id', removerIds)
      removidos = removerIds.length
    }
  }

  await admin.from('marketing_logs').insert({
    tipo: 'acao', ref_id: id, acao: 'editado',
    usuario_id: auth.user.id, detalhes: { adicionados, removidos, protegidos },
  })

  return NextResponse.json({ ok: true, adicionados, removidos, protegidos })
}

// DELETE — exclui a ação (e comprovantes/postos vinculados)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autorizar()
  if ('erro' in auth) return NextResponse.json({ error: auth.erro }, { status: auth.status })

  const { id } = await params
  const admin = createAdminClient()

  const { data: aps } = await admin.from('marketing_acao_postos').select('id').eq('acao_id', id)
  const apIds = (aps ?? []).map((a: any) => a.id)

  if (apIds.length) await admin.from('marketing_comprovantes').delete().in('acao_posto_id', apIds)
  await admin.from('marketing_acao_postos').delete().eq('acao_id', id)
  const { error } = await admin.from('marketing_acoes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
