-- =====================================================================
-- 034_extrato_tarefas.sql
-- Importação de extrato bancário (Excel) nas tarefas de conciliação
-- O sistema lê o arquivo, calcula saldo_dia - saldo_anterior e
-- compara com o AUTOSYSTEM. Se bater, conclui a tarefa automaticamente.
-- =====================================================================

-- ─── Storage bucket para extratos Excel ───────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'extratos-bancarios',
  'extratos-bancarios',
  false,
  10485760, -- 10 MB
  ARRAY[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "extratos_upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'extratos-bancarios');

CREATE POLICY "extratos_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'extratos-bancarios');

CREATE POLICY "extratos_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'extratos-bancarios');

-- ─── Campos de extrato na tabela tarefas ──────────────────────────────────────
ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS extrato_arquivo_path  TEXT,
  ADD COLUMN IF NOT EXISTS extrato_arquivo_nome  TEXT,
  ADD COLUMN IF NOT EXISTS extrato_data          DATE,
  ADD COLUMN IF NOT EXISTS extrato_saldo_dia     NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS extrato_saldo_anterior NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS extrato_movimento     NUMERIC(15, 2),  -- saldo_dia - saldo_anterior
  ADD COLUMN IF NOT EXISTS extrato_saldo_externo NUMERIC(15, 2),  -- calculado do AUTOSYSTEM
  ADD COLUMN IF NOT EXISTS extrato_diferenca     NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS extrato_status        TEXT
    CHECK (extrato_status IN ('ok', 'divergente')),
  ADD COLUMN IF NOT EXISTS extrato_validado_em   TIMESTAMPTZ;

-- ─── Mapeamento: conta bancária → código da conta no AUTOSYSTEM ───────────────
ALTER TABLE public.contas_bancarias
  ADD COLUMN IF NOT EXISTS codigo_conta_externo TEXT;

COMMENT ON COLUMN public.contas_bancarias.codigo_conta_externo IS
  'Código da conta no AUTOSYSTEM (ex: 1.2.139) para cruzamento do extrato bancário';
