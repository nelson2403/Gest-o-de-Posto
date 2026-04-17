-- =====================================================================
-- 024_senhas_tef.sql
-- Tabela para senhas de implantação dos TEFs por posto
-- Execute no Supabase SQL Editor
-- =====================================================================

CREATE TABLE IF NOT EXISTS senhas_tef (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  posto_id    UUID        NOT NULL REFERENCES postos(id)   ON DELETE CASCADE,
  senha       TEXT        NOT NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (posto_id)
);

CREATE INDEX IF NOT EXISTS idx_senhas_tef_posto_id   ON senhas_tef(posto_id);
CREATE INDEX IF NOT EXISTS idx_senhas_tef_empresa_id ON senhas_tef(empresa_id);

CREATE TRIGGER trg_senhas_tef_updated_at
  BEFORE UPDATE ON senhas_tef
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE senhas_tef ENABLE ROW LEVEL SECURITY;

CREATE POLICY "master_all_senhas_tef" ON senhas_tef
  FOR ALL TO authenticated
  USING (get_user_role() = 'master')
  WITH CHECK (get_user_role() = 'master');

CREATE POLICY "admin_all_senhas_tef" ON senhas_tef
  FOR ALL TO authenticated
  USING  (get_user_role() = 'admin' AND empresa_id = get_user_empresa_id())
  WITH CHECK (get_user_role() = 'admin' AND empresa_id = get_user_empresa_id());

CREATE POLICY "operador_select_senhas_tef" ON senhas_tef
  FOR SELECT TO authenticated
  USING (get_user_role() IN ('operador', 'conciliador') AND empresa_id = get_user_empresa_id());
