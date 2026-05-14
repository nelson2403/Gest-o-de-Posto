-- ─────────────────────────────────────────────────────────────────────────────
-- 069_role_rh.sql
-- Adiciona role 'rh' ao sistema
-- Acesso: postos (leitura), contas bancárias (leitura), tarefas (leitura),
--         controle de caixas (leitura), tarefas fiscal (leitura),
--         anydesk (leitura), câmeras (leitura)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Constraint ────────────────────────────────────────────────────────────
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_role_check;
ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_role_check
  CHECK (role IN (
    'master',
    'adm_financeiro', 'adm_fiscal', 'adm_marketing', 'adm_transpombal', 'adm_contas_pagar',
    'operador_caixa', 'operador_conciliador',
    'gerente', 'rh',
    -- legado (mantidos para compatibilidade com dados antigos)
    'admin', 'operador', 'conciliador', 'fechador', 'marketing', 'transpombal', 'fiscal'
  ));

-- ── 2. Helper function ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_rh()
RETURNS BOOLEAN AS $$
  SELECT (SELECT role FROM public.usuarios WHERE id = auth.uid()) = 'rh'
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ── 3. Permite que ADMs criem/gerenciem usuários rh ──────────────────────────
DROP POLICY IF EXISTS "admin_manage_usuarios" ON public.usuarios;
CREATE POLICY "admin_manage_usuarios" ON public.usuarios
  FOR ALL TO authenticated
  USING (
    is_any_admin()
    AND empresa_id = get_user_empresa_id()
    AND role IN (
      'operador_caixa', 'operador_conciliador', 'gerente', 'rh',
      'operador', 'fechador', 'conciliador'  -- legado
    )
  )
  WITH CHECK (
    is_any_admin()
    AND empresa_id = get_user_empresa_id()
    AND role IN (
      'operador_caixa', 'operador_conciliador', 'gerente', 'rh',
      'operador', 'fechador', 'conciliador'  -- legado
    )
  );

-- ── 4. Postos — rh vê todos os postos da empresa ─────────────────────────────
DROP POLICY IF EXISTS "rh_read_postos" ON public.postos;
CREATE POLICY "rh_read_postos" ON public.postos
  FOR SELECT TO authenticated
  USING (is_rh() AND empresa_id = get_user_empresa_id());

-- ── 5. Contas Bancárias — rh somente leitura ────────────────────────────────
DROP POLICY IF EXISTS "rh_read_contas_bancarias" ON public.contas_bancarias;
CREATE POLICY "rh_read_contas_bancarias" ON public.contas_bancarias
  FOR SELECT TO authenticated
  USING (is_rh() AND empresa_id = get_user_empresa_id());

-- ── 6. Tarefas — rh vê todas as tarefas da empresa (leitura) ─────────────────
DROP POLICY IF EXISTS "rh_select_tarefas" ON public.tarefas;
CREATE POLICY "rh_select_tarefas" ON public.tarefas
  FOR SELECT TO authenticated
  USING (is_rh() AND empresa_id = get_user_empresa_id());

-- ── 7. Tarefas Recorrentes — rh somente leitura ──────────────────────────────
DROP POLICY IF EXISTS "rh_select_tarefas_recorrentes" ON public.tarefas_recorrentes;
CREATE POLICY "rh_select_tarefas_recorrentes" ON public.tarefas_recorrentes
  FOR SELECT TO authenticated
  USING (is_rh() AND empresa_id = get_user_empresa_id());

-- ── 8. Fechamentos de Caixa — rh somente leitura (empresa inteira) ───────────
DROP POLICY IF EXISTS "rh_select_fechamentos_caixa" ON public.fechamentos_caixa;
CREATE POLICY "rh_select_fechamentos_caixa" ON public.fechamentos_caixa
  FOR SELECT TO authenticated
  USING (is_rh() AND empresa_id = get_user_empresa_id());

-- ── 9. Arquivos de fechamento — rh somente leitura ───────────────────────────
DROP POLICY IF EXISTS "rh_select_fechamento_arquivos" ON public.fechamento_arquivos;
CREATE POLICY "rh_select_fechamento_arquivos" ON public.fechamento_arquivos
  FOR SELECT TO authenticated
  USING (
    is_rh()
    AND fechamento_id IN (
      SELECT id FROM public.fechamentos_caixa WHERE empresa_id = get_user_empresa_id()
    )
  );

-- ── 10. AnyDesk — rh somente leitura ─────────────────────────────────────────
DROP POLICY IF EXISTS "rh_read_anydesk" ON public.acessos_anydesk;
CREATE POLICY "rh_read_anydesk" ON public.acessos_anydesk
  FOR SELECT TO authenticated
  USING (
    is_rh()
    AND posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id())
  );

-- ── 11. Câmeras — rh somente leitura ─────────────────────────────────────────
DROP POLICY IF EXISTS "rh_read_cameras" ON public.acessos_cameras;
CREATE POLICY "rh_read_cameras" ON public.acessos_cameras
  FOR SELECT TO authenticated
  USING (
    is_rh()
    AND posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id())
  );

-- ── 12. Contatos do posto — rh pode ver ──────────────────────────────────────
DROP POLICY IF EXISTS "rh_read_contatos" ON public.posto_contatos;
CREATE POLICY "rh_read_contatos" ON public.posto_contatos
  FOR SELECT TO authenticated
  USING (
    is_rh()
    AND posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id())
  );

-- ── 13. Visibilidade de colegas ───────────────────────────────────────────────
-- A policy "user_see_company_users" usa is_any_admin() OR is_any_operador().
-- rh não está em nenhum dos dois, então precisa de policy própria.
DROP POLICY IF EXISTS "rh_see_company_users" ON public.usuarios;
CREATE POLICY "rh_see_company_users" ON public.usuarios
  FOR SELECT TO authenticated
  USING (is_rh() AND empresa_id = get_user_empresa_id());
