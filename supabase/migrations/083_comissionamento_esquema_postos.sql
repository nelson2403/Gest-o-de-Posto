-- ─────────────────────────────────────────────────────────────────────────────
-- 083_comissionamento_esquema_postos.sql
--
-- 1) Vínculo N:N esquema↔posto — define em quais postos cada esquema é
--    aplicado. Um mesmo esquema pode valer para múltiplos postos, e um
--    posto pode escolher entre múltiplos esquemas.
--
-- 2) Filtros de produto no esquema — coluna `product_filters` jsonb que
--    restringe o escopo do esquema a um subset de vendas (espelha
--    `plans.product_filters` do projeto de referência).
--
--    Formato:
--      [
--        { "tipo": "produto"|"grupo_produto"|"subgrupo_produto"|"produto_tipo",
--          "valores": ["X","Y"],
--          "modo":   "incluir"|"excluir" }
--      ]
--
--    Múltiplas linhas se combinam por AND. Vendas que não passam pelo
--    filtro do esquema sequer entram na avaliação das regras.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Vínculo N:N esquema↔posto ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comissio_esquema_postos (
  esquema_id  UUID NOT NULL REFERENCES public.comissio_esquemas(id) ON DELETE CASCADE,
  posto_id    UUID NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (esquema_id, posto_id)
);

CREATE INDEX IF NOT EXISTS idx_comissio_esquema_postos_posto    ON public.comissio_esquema_postos(posto_id);
CREATE INDEX IF NOT EXISTS idx_comissio_esquema_postos_esquema  ON public.comissio_esquema_postos(esquema_id);

ALTER TABLE public.comissio_esquema_postos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comissio_esquema_postos_select_authenticated"
  ON public.comissio_esquema_postos FOR SELECT
  TO authenticated USING (TRUE);

CREATE POLICY "comissio_esquema_postos_admin_all"
  ON public.comissio_esquema_postos FOR ALL
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

-- ── product_filters no esquema ───────────────────────────────────────────────
ALTER TABLE public.comissio_esquemas
  ADD COLUMN IF NOT EXISTS product_filters JSONB NOT NULL DEFAULT '[]'::jsonb;
