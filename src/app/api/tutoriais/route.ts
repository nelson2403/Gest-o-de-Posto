import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'tutoriais'

async function getRole() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, role: null as string | null }
  const { data: u } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
  return { user, role: (u?.role ?? null) as string | null }
}

// GET — lista os tutoriais (qualquer usuário logado)
export async function GET() {
  const { user } = await getRole()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tutoriais')
    .select('id, titulo, descricao, arquivo_path, arquivo_nome, criado_em')
    .order('ordem', { ascending: true })
    .order('criado_em', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const tutoriais = (data ?? []).map(t => ({
    ...t,
    url: admin.storage.from(BUCKET).getPublicUrl(t.arquivo_path).data.publicUrl,
  }))
  return NextResponse.json({ tutoriais })
}

// POST — upload de um vídeo (só master). multipart: titulo, descricao, file
export async function POST(req: NextRequest) {
  const { user, role } = await getRole()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (role !== 'master') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const form = await req.formData()
  const titulo    = String(form.get('titulo') ?? '').trim()
  const descricao = String(form.get('descricao') ?? '').trim()
  const file      = form.get('file') as File | null

  if (!titulo) return NextResponse.json({ error: 'Informe o título' }, { status: 400 })
  if (!file)   return NextResponse.json({ error: 'Selecione o arquivo de vídeo' }, { status: 400 })

  const admin = createAdminClient()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${crypto.randomUUID()}_${safeName}`

  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type || 'video/mp4', upsert: false })

  if (upErr) return NextResponse.json({ error: `Erro no upload: ${upErr.message}` }, { status: 500 })

  const { data, error } = await admin
    .from('tutoriais')
    .insert({ titulo, descricao: descricao || null, arquivo_path: path, arquivo_nome: file.name, criado_por: user.id })
    .select('id, titulo, descricao, arquivo_path, arquivo_nome, criado_em')
    .single()

  if (error) {
    await admin.storage.from(BUCKET).remove([path])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  return NextResponse.json({ tutorial: { ...data, url } })
}

// PATCH — edita um tutorial (só master). multipart: id, titulo, descricao, file?(troca)
export async function PATCH(req: NextRequest) {
  const { user, role } = await getRole()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (role !== 'master') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const form = await req.formData()
  const id        = String(form.get('id') ?? '').trim()
  const titulo    = String(form.get('titulo') ?? '').trim()
  const descricao = String(form.get('descricao') ?? '').trim()
  const file      = form.get('file') as File | null

  if (!id)     return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  if (!titulo) return NextResponse.json({ error: 'Informe o título' }, { status: 400 })

  const admin = createAdminClient()
  const { data: atual } = await admin.from('tutoriais').select('arquivo_path').eq('id', id).single()
  if (!atual) return NextResponse.json({ error: 'Tutorial não encontrado' }, { status: 404 })

  const updates: Record<string, unknown> = { titulo, descricao: descricao || null }

  // Trocar o vídeo (opcional)
  if (file && file.size > 0) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${crypto.randomUUID()}_${safeName}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type || 'video/mp4', upsert: false })
    if (upErr) return NextResponse.json({ error: `Erro no upload: ${upErr.message}` }, { status: 500 })
    updates.arquivo_path = path
    updates.arquivo_nome = file.name
  }

  const { data, error } = await admin
    .from('tutoriais')
    .update(updates)
    .eq('id', id)
    .select('id, titulo, descricao, arquivo_path, arquivo_nome, criado_em')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Remove o arquivo antigo após trocar com sucesso
  if (updates.arquivo_path && atual.arquivo_path && atual.arquivo_path !== updates.arquivo_path) {
    await admin.storage.from(BUCKET).remove([atual.arquivo_path])
  }

  const url = admin.storage.from(BUCKET).getPublicUrl(data.arquivo_path).data.publicUrl
  return NextResponse.json({ tutorial: { ...data, url } })
}

// DELETE — remove um tutorial (só master). ?id=
export async function DELETE(req: NextRequest) {
  const { user, role } = await getRole()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (role !== 'master') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  const admin = createAdminClient()
  const { data: t } = await admin.from('tutoriais').select('arquivo_path').eq('id', id).single()
  if (t?.arquivo_path) await admin.storage.from(BUCKET).remove([t.arquivo_path])
  const { error } = await admin.from('tutoriais').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
