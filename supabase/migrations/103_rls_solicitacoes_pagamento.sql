-- Corrige RLS de solicitacoes_pagamento: políticas USING (true) eram permissivas demais.
-- Agora cada usuário só acessa registros da sua empresa.

DROP POLICY IF EXISTS "sol_pag_select" ON public.solicitacoes_pagamento;
DROP POLICY IF EXISTS "sol_pag_insert" ON public.solicitacoes_pagamento;
DROP POLICY IF EXISTS "sol_pag_update" ON public.solicitacoes_pagamento;
DROP POLICY IF EXISTS "sol_pag_delete" ON public.solicitacoes_pagamento;

-- Master vê tudo; demais usuários veem só da sua empresa
CREATE POLICY "sol_pag_select" ON public.solicitacoes_pagamento
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND (u.role = 'master' OR u.empresa_id = solicitacoes_pagamento.empresa_id)
    )
  );

-- INSERT: qualquer usuário autenticado pode criar (empresa_id validada pelo app)
CREATE POLICY "sol_pag_insert" ON public.solicitacoes_pagamento
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: apenas master ou usuário da mesma empresa
CREATE POLICY "sol_pag_update" ON public.solicitacoes_pagamento
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND (u.role = 'master' OR u.empresa_id = solicitacoes_pagamento.empresa_id)
    )
  );

-- DELETE: apenas master
CREATE POLICY "sol_pag_delete" ON public.solicitacoes_pagamento
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.role = 'master')
  );
