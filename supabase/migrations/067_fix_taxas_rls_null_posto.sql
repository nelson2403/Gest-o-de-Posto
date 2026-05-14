-- Fix RLS policies for taxas table to allow NULL posto_id
-- (used when abrangencia = 'todos_postos' or 'multiplos_postos')

DROP POLICY IF EXISTS "admin_manage_taxas" ON public.taxas;
CREATE POLICY "admin_manage_taxas" ON public.taxas
  FOR ALL TO authenticated
  USING (
    is_any_admin() AND (
      posto_id IS NULL OR
      posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id())
    )
  )
  WITH CHECK (
    is_any_admin() AND (
      posto_id IS NULL OR
      posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id())
    )
  );

DROP POLICY IF EXISTS "operador_read_taxas" ON public.taxas;
CREATE POLICY "operador_read_taxas" ON public.taxas
  FOR SELECT TO authenticated
  USING (
    posto_id IS NULL OR
    posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id())
  );
