import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/marketing/acoes/[id]/comprovante
// Multipart: arquivo (File), valor, descricao, posto_id
// Gerente envia comprovante para a ação no seu posto
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id: acaoId } = await params
  const formData = await req.formData()
  const arquivo   = formData.get('arquivo')  as File | null
  const valor     = formData.get('valor')    as string | null
  const descricao = formData.get('descricao') as string | null
  const postoId   = formData.get('posto_id') as string | null

  if (!arquivo || !postoId) {
    return NextResponse.json({ error: 'arquivo e posto_id são obrigatórios' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Busca o acao_posto correspondente
  const { data: acaoPosto, error: apErr } = await admin
    .from('marketing_acao_postos')
    .select('id, status, prazo_envio:marketing_acoes(prazo_envio)')
    .eq('acao_id', acaoId)
    .eq('posto_id', postoId)
    .single()

  if (apErr || !acaoPosto) {
    return NextResponse.json({ error: 'Posto não participa desta ação' }, { status: 404 })
  }

  // Upload no Storage
  const ext  = arquivo.name.split('.').pop()
  const path = `acoes/${acaoId}/${postoId}/${Date.now()}.${ext}`
  const buffer = Buffer.from(await arquivo.arrayBuffer())

  const { error: uploadError } = await admin.storage
    .from('marketing-docs')
    .upload(path, buffer, { contentType: arquivo.type, upsert: false })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: urlData } = admin.storage.from('marketing-docs').getPublicUrl(path)

  const { data: comp, error: compErr } = await admin
    .from('marketing_comprovantes')
    .insert({
      acao_posto_id: acaoPosto.id,
      arquivo_url:   urlData.publicUrl,
      arquivo_nome:  arquivo.name,
      tipo_arquivo:  ext,
      valor:         valor ? Number(valor) : null,
      descricao,
      uploaded_by:   user.id,
    })
    .select()
    .single()

  if (compErr) return NextResponse.json({ error: compErr.message }, { status: 500 })

  // Atualiza status do acao_posto para 'enviado'
  await admin.from('marketing_acao_postos')
    .update({ status: 'enviado' })
    .eq('id', acaoPosto.id)
    .eq('status', 'pendente')

  await admin.from('marketing_logs').insert({
    tipo: 'comprovante', ref_id: acaoPosto.id, acao: 'comprovante_anexado',
    usuario_id: user.id, detalhes: { arquivo_nome: arquivo.name, posto_id: postoId }
  })

  return NextResponse.json({ comprovante: comp }, { status: 201 })
}
