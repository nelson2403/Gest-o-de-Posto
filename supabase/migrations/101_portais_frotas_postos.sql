-- Vincula quais postos estão cadastrados em cada portal de frotas
CREATE TABLE IF NOT EXISTS public.portais_frotas_postos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id  UUID NOT NULL REFERENCES public.portais_frotas(id) ON DELETE CASCADE,
  posto_id   UUID NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (portal_id, posto_id)
);

ALTER TABLE public.portais_frotas_postos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portais_frotas_postos_all" ON public.portais_frotas_postos
  FOR ALL USING (auth.uid() IS NOT NULL);
