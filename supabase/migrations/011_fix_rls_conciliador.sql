-- 011_fix_rls_conciliador.sql

-- 1. Permite que qualquer usuario autenticado leia seu proprio registro
CREATE POLICY "user_see_self" ON public.usuarios
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- 2. Admin pode gerenciar operadores e conciliadores
DROP POLICY IF EXISTS "admin_manage_operadores" ON public.usuarios;

CREATE POLICY "admin_manage_usuarios" ON public.usuarios
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    AND empresa_id = get_user_empresa_id()
    AND role IN ('operador', 'conciliador')
  )
  WITH CHECK (
    get_user_role() = 'admin'
    AND empresa_id = get_user_empresa_id()
    AND role IN ('operador', 'conciliador')
  );

-- 3. Inclui conciliador na visualizacao da empresa
DROP POLICY IF EXISTS "user_see_company_users" ON public.usuarios;

CREATE POLICY "user_see_company_users" ON public.usuarios
  FOR SELECT TO authenticated
  USING (
    get_user_role() IN ('admin', 'operador', 'conciliador')
    AND empresa_id = get_user_empresa_id()
  );
