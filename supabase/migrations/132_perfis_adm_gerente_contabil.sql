-- ─────────────────────────────────────────────────────────────────────────────
-- 132_perfis_adm_gerente_contabil.sql
-- Dois perfis novos:
--   adm_gerente  → cadastro de TODOS os postos + Compras + Comissionamento
--   adm_contabil → Financeiro + Fiscal + Contábil
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Atualiza o constraint do campo role
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_role_check;
ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_role_check
  CHECK (role IN (
    'master',
    'adm_financeiro', 'adm_fiscal', 'adm_marketing', 'adm_transpombal', 'adm_contas_pagar',
    'adm_gerente', 'adm_contabil',
    'operador_caixa', 'operador_conciliador', 'operador_contagem',
    'gerente', 'rh',
    -- legado (compatibilidade com dados antigos)
    'admin', 'operador', 'conciliador', 'fechador', 'marketing', 'transpombal', 'fiscal'
  ));

-- 2. Helpers
CREATE OR REPLACE FUNCTION public.is_adm_gerente()
RETURNS BOOLEAN AS $$
  SELECT (SELECT role FROM public.usuarios WHERE id = auth.uid()) = 'adm_gerente'
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_adm_contabil()
RETURNS BOOLEAN AS $$
  SELECT (SELECT role FROM public.usuarios WHERE id = auth.uid()) = 'adm_contabil'
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- 3. adm_gerente gerencia o cadastro de TODOS os postos (CRUD via client/RLS)
DROP POLICY IF EXISTS "adm_gerente_manage_postos" ON public.postos;
CREATE POLICY "adm_gerente_manage_postos" ON public.postos
  FOR ALL TO authenticated
  USING (is_adm_gerente())
  WITH CHECK (is_adm_gerente());

-- 4. Os novos perfis precisam enxergar a própria linha em usuarios
--    (a AuthContext carrega o role a partir daí).
DROP POLICY IF EXISTS "adm_gerente_see_own_user" ON public.usuarios;
CREATE POLICY "adm_gerente_see_own_user" ON public.usuarios
  FOR SELECT TO authenticated
  USING (is_adm_gerente() AND id = auth.uid());

DROP POLICY IF EXISTS "adm_contabil_see_own_user" ON public.usuarios;
CREATE POLICY "adm_contabil_see_own_user" ON public.usuarios
  FOR SELECT TO authenticated
  USING (is_adm_contabil() AND id = auth.uid());

-- 5. adm_gerente também lê todos os postos (já coberto pelo FOR ALL acima, mas
--    deixamos explícito que não há filtro por empresa — vê todos).

NOTIFY pgrst, 'reload schema';
