-- =====================================================================
-- 040_role_gerente.sql
-- Adiciona role 'gerente' ao sistema
-- Permissões: apenas criar solicitação de patrocínio e anexar documentos
-- =====================================================================

ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_role_check;
ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_role_check
  CHECK (role IN ('master', 'admin', 'operador', 'conciliador', 'fechador', 'marketing', 'gerente'));

-- Atualiza RLS de marketing_patrocinios para permitir INSERT do gerente
DROP POLICY IF EXISTS "mkt_pat_insert" ON marketing_patrocinios;
CREATE POLICY "mkt_pat_insert" ON marketing_patrocinios FOR INSERT TO authenticated
  WITH CHECK (
    mkt_auth_role() IN ('master','admin','marketing') OR
    (mkt_auth_role() IN ('operador','gerente') AND posto_id = mkt_auth_posto_id())
  );

-- Gerente pode ver somente os patrocínios do seu posto
DROP POLICY IF EXISTS "mkt_pat_select" ON marketing_patrocinios;
CREATE POLICY "mkt_pat_select" ON marketing_patrocinios FOR SELECT TO authenticated
  USING (
    mkt_auth_role() IN ('master','admin','marketing') OR
    posto_id = mkt_auth_posto_id()
  );

-- Gerente pode editar patrocínio pendente do seu posto (para anexar doc)
DROP POLICY IF EXISTS "mkt_pat_update" ON marketing_patrocinios;
CREATE POLICY "mkt_pat_update" ON marketing_patrocinios FOR UPDATE TO authenticated
  USING (
    mkt_auth_role() IN ('master','admin','marketing') OR
    (posto_id = mkt_auth_posto_id() AND status = 'pendente')
  );

-- Gerente pode fazer upload de comprovantes
DROP POLICY IF EXISTS "mkt_comp_select" ON marketing_comprovantes;
DROP POLICY IF EXISTS "mkt_comp_insert" ON marketing_comprovantes;
CREATE POLICY "mkt_comp_select" ON marketing_comprovantes FOR SELECT TO authenticated
  USING (mkt_auth_role() IN ('master','admin','marketing') OR uploaded_by = auth.uid());
CREATE POLICY "mkt_comp_insert" ON marketing_comprovantes FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());
