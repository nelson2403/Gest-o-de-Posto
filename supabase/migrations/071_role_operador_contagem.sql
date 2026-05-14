-- ─────────────────────────────────────────────────────────────────────────────
-- 071_role_operador_contagem.sql
-- Adiciona role 'operador_contagem' ao sistema
-- Acesso: apenas /estoque/contagem — pode criar e visualizar contagens de estoque
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Atualiza o constraint do campo role ───────────────────────────────────
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_role_check;
ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_role_check
  CHECK (role IN (
    'master',
    'adm_financeiro', 'adm_fiscal', 'adm_marketing', 'adm_transpombal', 'adm_contas_pagar',
    'operador_caixa', 'operador_conciliador', 'operador_contagem',
    'gerente', 'rh',
    -- legado (mantidos para compatibilidade com dados antigos)
    'admin', 'operador', 'conciliador', 'fechador', 'marketing', 'transpombal', 'fiscal'
  ));

-- ── 2. Helper function ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_operador_contagem()
RETURNS BOOLEAN AS $$
  SELECT (SELECT role FROM public.usuarios WHERE id = auth.uid()) = 'operador_contagem'
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ── 3. Permite que ADMs criem/gerenciem usuários operador_contagem ───────────
DROP POLICY IF EXISTS "admin_manage_usuarios" ON public.usuarios;
CREATE POLICY "admin_manage_usuarios" ON public.usuarios
  FOR ALL TO authenticated
  USING (
    is_any_admin()
    AND empresa_id = get_user_empresa_id()
    AND role IN (
      'operador_caixa', 'operador_conciliador', 'operador_contagem', 'gerente', 'rh',
      'operador', 'fechador', 'conciliador'  -- legado
    )
  )
  WITH CHECK (
    is_any_admin()
    AND empresa_id = get_user_empresa_id()
    AND role IN (
      'operador_caixa', 'operador_conciliador', 'operador_contagem', 'gerente', 'rh',
      'operador', 'fechador', 'conciliador'  -- legado
    )
  );

-- ── 4. Postos — operador_contagem vê todos os postos da empresa ──────────────
DROP POLICY IF EXISTS "contagem_read_postos" ON public.postos;
CREATE POLICY "contagem_read_postos" ON public.postos
  FOR SELECT TO authenticated
  USING (is_operador_contagem() AND empresa_id = get_user_empresa_id());

-- ── 5. Visibilidade de si mesmo ──────────────────────────────────────────────
DROP POLICY IF EXISTS "contagem_see_own_user" ON public.usuarios;
CREATE POLICY "contagem_see_own_user" ON public.usuarios
  FOR SELECT TO authenticated
  USING (is_operador_contagem() AND id = auth.uid());
