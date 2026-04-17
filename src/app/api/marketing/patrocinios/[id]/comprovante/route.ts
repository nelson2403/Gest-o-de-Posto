import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/marketing/patrocinios/[id]/comprovante
// Multipart: arquivo (File), valor (number), descricao (string)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const formData = await req.formData()
  const arquivo  = formData.get('arquivo') as File | null
  const valor    = formData.get('valor')    as string | null
  const descricao = formData.get('descricao') as string | null

  if (!arquivo) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })

  const admin = createAdminClient()

  // Faz upload no Supabase Storage
  const ext = arquivo.name.split('.').pop()
  const path = `patrocinios/${id}/${Date.now()}.${ext}`
  const buffer = Buffer.from(await arquivo.arrayBuffer())

  const { error: uploadError } = await admin.storage
    .from('marketing-docs')
    .upload(path, buffer, { contentType: arquivo.type, upsert: false })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: urlData } = admin.storage.from('marketing-docs').getPublicUrl(path)

  const { data, error } = await admin
    .from('marketing_comprovantes')
    .insert({
      patrocinio_id: id,
      arquivo_url:   urlData.publicUrl,
      arquivo_nome:  arquivo.name,
      tipo_arquivo:  ext,
      valor:         valor ? Number(valor) : null,
      descricao,
      uploaded_by:   user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Atualiza documento_url no patrocínio (primeiro comprovante)
  await admin.from('marketing_patrocinios')
    .update({ documento_url: urlData.publicUrl })
    .eq('id', id)
    .is('documento_url', null)

  await admin.from('marketing_logs').insert({
    tipo: 'comprovante', ref_id: id, acao: 'comprovante_anexado',
    usuario_id: user.id, detalhes: { arquivo_nome: arquivo.name }
  })

  return NextResponse.json({ comprovante: data }, { status: 201 })
}
