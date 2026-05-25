-- ─────────────────────────────────────────────────────────────────────────────
-- 078_comissionamento_esquemas.sql
-- Esquemas de comissionamento + suas regras de cálculo
--
--   • comissio_esquemas — cada esquema é um catálogo de regras
--       - nome, descrição, status (rascunho/ativo/inativo)
--       - tenant único por instalação (não há multi-tenant aqui)
--   • comissio_regras — regras pertencentes a um esquema
--       - nome, descrição, status, prioridade (menor = aplica antes)
--       - condicoes  (JSONB)  — árvore de condições (grupos AND/OR + comparações)
--                              vazia por enquanto; UI de rule builder vem depois
--       - resultado_tipo      — percentual / valor_fixo / por_unidade
--       - resultado_valor     — numeric
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.comissio_esquemas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            TEXT NOT NULL,
  descricao       TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'rascunho'
                   CHECK (status IN ('rascunho','ativo','inativo')),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por      UUID REFERENCES public.usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_comissio_esquemas_status ON public.comissio_esquemas(status);

CREATE TABLE IF NOT EXISTS public.comissio_regras (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  esquema_id       UUID NOT NULL REFERENCES public.comissio_esquemas(id) ON DELETE CASCADE,
  nome             TEXT NOT NULL,
  descricao        TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'rascunho'
                    CHECK (status IN ('rascunho','ativo','inativo')),
  prioridade       INTEGER NOT NULL DEFAULT 1,
  condicoes        JSONB NOT NULL DEFAULT '{}'::jsonb,
  resultado_tipo   TEXT NOT NULL DEFAULT 'percentual'
                    CHECK (resultado_tipo IN ('percentual','valor_fixo','por_unidade')),
  resultado_valor  NUMERIC NOT NULL DEFAULT 0,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por       UUID REFERENCES public.usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_comissio_regras_esquema     ON public.comissio_regras(esquema_id);
CREATE INDEX IF NOT EXISTS idx_comissio_regras_status      ON public.comissio_regras(status);
CREATE INDEX IF NOT EXISTS idx_comissio_regras_prioridade  ON public.comissio_regras(esquema_id, prioridade);

-- ── Triggers de atualizado_em ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_comissio_esquemas()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS comissio_esquemas_touch ON public.comissio_esquemas;
CREATE TRIGGER comissio_esquemas_touch
  BEFORE UPDATE ON public.comissio_esquemas
  FOR EACH ROW EXECUTE FUNCTION public.touch_comissio_esquemas();

CREATE OR REPLACE FUNCTION public.touch_comissio_regras()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS comissio_regras_touch ON public.comissio_regras;
CREATE TRIGGER comissio_regras_touch
  BEFORE UPDATE ON public.comissio_regras
  FOR EACH ROW EXECUTE FUNCTION public.touch_comissio_regras();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.comissio_esquemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissio_regras   ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer autenticado.
CREATE POLICY "comissio_esquemas_select_authenticated"
  ON public.comissio_esquemas FOR SELECT
  TO authenticated USING (TRUE);

CREATE POLICY "comissio_regras_select_authenticated"
  ON public.comissio_regras FOR SELECT
  TO authenticated USING (TRUE);

-- ALL: master / adm_financeiro / rh.
CREATE POLICY "comissio_esquemas_admin_all"
  ON public.comissio_esquemas FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
        AND role IN ('master','adm_financeiro','rh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
        AND role IN ('master','adm_financeiro','rh')
    )
  );

CREATE POLICY "comissio_regras_admin_all"
  ON public.comissio_regras FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
        AND role IN ('master','adm_financeiro','rh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
        AND role IN ('master','adm_financeiro','rh')
    )
  );
