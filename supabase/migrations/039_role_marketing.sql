-- =====================================================================
-- 039_role_marketing.sql
-- Adiciona role 'marketing' ao sistema
-- =====================================================================

-- ── 1. Adiciona 'marketing' ao CHECK constraint de role ──────────────
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_role_check;
ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_role_check
  CHECK (role IN ('master', 'admin', 'operador', 'conciliador', 'fechador', 'marketing'));

-- ── 2. Storage bucket para documentos de marketing ──────────────────
-- Executar via dashboard do Supabase ou descomente se tiver acesso ao schema storage:
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES (
--   'marketing-docs',
--   'marketing-docs',
--   false,
--   10485760,  -- 10 MB
--   ARRAY['application/pdf','image/jpeg','image/png','image/webp']
-- ) ON CONFLICT DO NOTHING;

-- ── 3. Policies de Storage (executar no Supabase Dashboard > Storage) ─
-- Política de INSERT: qualquer autenticado pode enviar seus próprios arquivos
-- Política de SELECT: master/admin/marketing veem tudo; outros só os seus
-- (configurar manualmente no painel do Supabase Storage após criar o bucket)
