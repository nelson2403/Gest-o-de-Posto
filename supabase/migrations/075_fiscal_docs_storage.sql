-- Migration 075: Storage bucket para documentos fiscais (NF e boletos)
-- Fotos/PDFs enviados pelos gerentes ao reconhecer notas fiscais

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fiscal-docs',
  'fiscal-docs',
  true,
  20971520,  -- 20 MB por arquivo
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public           = true,
  file_size_limit  = 20971520,
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf'
  ];

-- Usuários autenticados podem fazer upload
CREATE POLICY "fiscal_docs_upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fiscal-docs');

-- Bucket público: qualquer pessoa com o link pode visualizar
CREATE POLICY "fiscal_docs_select"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'fiscal-docs');

-- Usuários autenticados podem substituir arquivos (upsert)
CREATE POLICY "fiscal_docs_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'fiscal-docs');

-- Usuários autenticados podem excluir (para substituição futura)
CREATE POLICY "fiscal_docs_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'fiscal-docs');


