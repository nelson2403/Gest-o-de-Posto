-- =====================================================================
-- 045_contas_vinculadas.sql
-- Tabela para vincular contas de acesso rápido por usuário.
-- Armazena apenas email + apelido — sem senhas.
-- =====================================================================

CREATE TABLE IF NOT EXISTS usuario_contas_vinculadas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  email       TEXT NOT NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (usuario_id, email)
);

ALTER TABLE usuario_contas_vinculadas ENABLE ROW LEVEL SECURITY;

-- Cada usuário só vê/edita suas próprias contas vinculadas
CREATE POLICY "contas_vinculadas_select" ON usuario_contas_vinculadas
  FOR SELECT TO authenticated
  USING (usuario_id = auth.uid());

CREATE POLICY "contas_vinculadas_insert" ON usuario_contas_vinculadas
  FOR INSERT TO authenticated
  WITH CHECK (usuario_id = auth.uid());

CREATE POLICY "contas_vinculadas_delete" ON usuario_contas_vinculadas
  FOR DELETE TO authenticated
  USING (usuario_id = auth.uid());
