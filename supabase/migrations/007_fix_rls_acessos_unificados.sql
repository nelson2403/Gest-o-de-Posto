-- Corrige as policies de RLS de acessos_unificados
-- que antes filtravam por posto_id (agora nullable).
-- Agora filtram por empresa_id.

DROP POLICY IF EXISTS "admin_manage_acessos_unif"  ON public.acessos_unificados;
DROP POLICY IF EXISTS "operador_rw_acessos_unif"   ON public.acessos_unificados;

-- Admin: gerencia acessos da própria empresa
CREATE POLICY "admin_manage_acessos_unif" ON public.acessos_unificados
    FOR ALL TO authenticated
    USING (
        get_user_role() = 'admin'
        AND empresa_id = get_user_empresa_id()
    )
    WITH CHECK (
        get_user_role() = 'admin'
        AND empresa_id = get_user_empresa_id()
    );

-- Operador: lê e gerencia acessos da própria empresa
CREATE POLICY "operador_rw_acessos_unif" ON public.acessos_unificados
    FOR ALL TO authenticated
    USING (
        get_user_role() = 'operador'
        AND empresa_id = get_user_empresa_id()
    )
    WITH CHECK (
        get_user_role() = 'operador'
        AND empresa_id = get_user_empresa_id()
    );
