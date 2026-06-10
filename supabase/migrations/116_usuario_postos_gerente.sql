-- Migration 116: vincular múltiplos postos a um gerente
-- (mantém posto_fechamento_id como posto principal para compatibilidade)

CREATE TABLE IF NOT EXISTS public.usuario_postos_gerente (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  posto_id   UUID NOT NULL REFERENCES public.postos(id)   ON DELETE CASCADE,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (usuario_id, posto_id)
);

CREATE INDEX IF NOT EXISTS idx_upg_usuario ON public.usuario_postos_gerente(usuario_id);

ALTER TABLE public.usuario_postos_gerente ENABLE ROW LEVEL SECURITY;

-- Master/adm gerenciam; o próprio gerente lê os seus
CREATE POLICY upg_admin ON public.usuario_postos_gerente FOR ALL TO authenticated
  USING (get_user_role() IN ('master', 'adm_financeiro'))
  WITH CHECK (get_user_role() IN ('master', 'adm_financeiro'));

CREATE POLICY upg_own_select ON public.usuario_postos_gerente FOR SELECT TO authenticated
  USING (usuario_id = auth.uid());

NOTIFY pgrst, 'reload schema';
