import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET        = 'fiscal-docs'
const MAX_BYTES     = 20 * 1024 * 1024  // 20 MB
const MIME_ALLOWED  = new Set(['application/pdf'])

// POST /api/fiscal/tarefas/[id]/upload
// FormData: arquivo (File), tipo ('nf' | 'boleto')
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const admin   = createAdminClient()

  // Valida que a tarefa existe e ainda pode receber anexo
  const { data: tarefa, error: tErr } = await admin
    .from('fiscal_tarefas')
    .select('id, status')
    .eq('id', id)
    .single()

  if (tErr || !tarefa) {
    return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })
  }
  if (tarefa.status === 'concluida' || tarefa.status === 'desconhecida') {
    return NextResponse.json({ error: 'Tarefa já encerrada' }, { status: 400 })
  }

  // Lê o FormData
  const formData = await req.formData()
  const arquivo  = formData.get('arquivo') as File | null
  const tipo     = formData.get('tipo')    as string | null

  if (!arquivo || !tipo) {
    return NextResponse.json({ error: 'arquivo e tipo são obrigatórios' }, { status: 400 })
  }
  if (tipo !== 'nf' && tipo !== 'boleto') {
    return NextResponse.json({ error: 'tipo deve ser "nf" ou "boleto"' }, { status: 400 })
  }

  // Valida tipo MIME
  const mime = arquivo.type || 'application/octet-stream'
  if (!MIME_ALLOWED.has(mime)) {
    return NextResponse.json(
      { error: `Tipo de arquivo não permitido: ${mime}. Use imagem ou PDF.` },
      { status: 415 },
    )
  }

  // Valida tamanho
  if (arquivo.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Arquivo muito grande (máx. 20 MB). Tamanho recebido: ${(arquivo.size / 1024 / 1024).toFixed(1)} MB` },
      { status: 413 },
    )
  }

  // Garante que o bucket existe (cria silenciosamente se não existir)
  await admin.storage.createBucket(BUCKET, {
    public:           true,
    fileSizeLimit:    MAX_BYTES,
    allowedMimeTypes: ['application/pdf'],
  }).catch(() => {})

  // Faz o upload
  const ext    = arquivo.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path   = `tarefas/${id}/${tipo}/${Date.now()}.${ext}`
  const buffer = Buffer.from(await arquivo.arrayBuffer())

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mime, upsert: true })

  if (uploadError) {
    return NextResponse.json({ error: `Erro no upload: ${uploadError.message}` }, { status: 500 })
  }

  const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path)

  return NextResponse.json({ url: urlData.publicUrl })
}
