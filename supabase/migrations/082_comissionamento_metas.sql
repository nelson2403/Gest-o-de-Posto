-- ─────────────────────────────────────────────────────────────────────────────
-- 082_comissionamento_metas.sql
--
-- Metas de venda + distribuição entre membros (espelha goals/goal_groups/
-- goal_splits do projeto de referência, adaptado para single-tenant com
-- escopo por posto).
--
-- Estrutura:
--   • comissio_metas_grupos — árvore hierárquica (parent_id auto-FK).
--     Permite organizar metas em categorias como
--       Combustíveis → { Gasolina, Etanol, Diesel }
--       Conveniência → { Bebidas, Cigarros }
--     Cada grupo é escopado por posto.
--
--   • comissio_metas — uma meta específica.
--       campo            = qual variável da venda a meta acompanha
--                          ('faturamento', 'quantidade', 'margem', 'mix')
--       filtro_tipo      = (opcional) restringe a meta a um subset de vendas:
--                          'produto' / 'grupo_produto' / 'subgrupo_produto'
--                          / 'produto_tipo'
--       filtro_valores   = array de identificadores/nomes a casar
--       filtro_modo      = 'incluir' (só esses) | 'excluir' (todos menos esses)
--       valor_meta       = meta TOTAL do posto para o período
--       period_start/end = janela de validade da meta
--
--   • comissio_metas_splits — distribuição da meta entre membros.
--       Cada split atribui um valor individual (em R$) a um membro do posto.
--       O motor de cálculo soma o realizado de cada vendedor e divide pelo
--       split dele para obter o atingimento_meta de cada um.
--
-- O motor de comissionamento (próxima fase) usa isso para resolver o campo
-- `atingimento_meta` dentro das condições da regra.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Grupos de metas (árvore) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comissio_metas_grupos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id        UUID NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  parent_id       UUID REFERENCES public.comissio_metas_grupos(id) ON DELETE CASCADE,
  nome            TEXT NOT NULL,
  period_start    DATE,
  period_end      DATE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por      UUID REFERENCES public.usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_comissio_metas_grupos_posto  ON public.comissio_metas_grupos(posto_id);
CREATE INDEX IF NOT EXISTS idx_comissio_metas_grupos_parent ON public.comissio_metas_grupos(parent_id);

CREATE OR REPLACE FUNCTION public.touch_comissio_metas_grupos()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS comissio_metas_grupos_touch ON public.comissio_metas_grupos;
CREATE TRIGGER comissio_metas_grupos_touch
  BEFORE UPDATE ON public.comissio_metas_grupos
  FOR EACH ROW EXECUTE FUNCTION public.touch_comissio_metas_grupos();

-- ── Metas ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comissio_metas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id        UUID NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  grupo_id        UUID REFERENCES public.comissio_metas_grupos(id) ON DELETE SET NULL,
  nome            TEXT NOT NULL,
  campo           TEXT NOT NULL
                   CHECK (campo IN ('faturamento','quantidade','margem','mix')),
  filtro_tipo     TEXT
                   CHECK (filtro_tipo IS NULL OR filtro_tipo IN (
                     'produto','grupo_produto','subgrupo_produto','produto_tipo'
                   )),
  filtro_valores  TEXT[],
  filtro_modo     TEXT NOT NULL DEFAULT 'incluir'
                   CHECK (filtro_modo IN ('incluir','excluir')),
  valor_meta      NUMERIC NOT NULL DEFAULT 0,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por      UUID REFERENCES public.usuarios(id),
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_comissio_metas_posto    ON public.comissio_metas(posto_id);
CREATE INDEX IF NOT EXISTS idx_comissio_metas_grupo    ON public.comissio_metas(grupo_id);
CREATE INDEX IF NOT EXISTS idx_comissio_metas_periodo  ON public.comissio_metas(period_start, period_end);

CREATE OR REPLACE FUNCTION public.touch_comissio_metas()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS comissio_metas_touch ON public.comissio_metas;
CREATE TRIGGER comissio_metas_touch
  BEFORE UPDATE ON public.comissio_metas
  FOR EACH ROW EXECUTE FUNCTION public.touch_comissio_metas();

-- ── Splits (distribuição da meta entre membros) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.comissio_metas_splits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_id         UUID NOT NULL REFERENCES public.comissio_metas(id) ON DELETE CASCADE,
  membro_id       UUID NOT NULL REFERENCES public.comissio_membros(id) ON DELETE CASCADE,
  valor_meta      NUMERIC NOT NULL DEFAULT 0,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (meta_id, membro_id)
);

CREATE INDEX IF NOT EXISTS idx_comissio_metas_splits_meta   ON public.comissio_metas_splits(meta_id);
CREATE INDEX IF NOT EXISTS idx_comissio_metas_splits_membro ON public.comissio_metas_splits(membro_id);

CREATE OR REPLACE FUNCTION public.touch_comissio_metas_splits()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS comissio_metas_splits_touch ON public.comissio_metas_splits;
CREATE TRIGGER comissio_metas_splits_touch
  BEFORE UPDATE ON public.comissio_metas_splits
  FOR EACH ROW EXECUTE FUNCTION public.touch_comissio_metas_splits();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.comissio_metas_grupos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissio_metas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissio_metas_splits  ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer autenticado.
CREATE POLICY "comissio_metas_grupos_select_authenticated"
  ON public.comissio_metas_grupos FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "comissio_metas_select_authenticated"
  ON public.comissio_metas FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "comissio_metas_splits_select_authenticated"
  ON public.comissio_metas_splits FOR SELECT TO authenticated USING (TRUE);

-- ALL: master / adm_financeiro / rh.
CREATE POLICY "comissio_metas_grupos_admin_all"
  ON public.comissio_metas_grupos FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid() AND role IN ('master','adm_financeiro','rh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid() AND role IN ('master','adm_financeiro','rh')
    )
  );

CREATE POLICY "comissio_metas_admin_all"
  ON public.comissio_metas FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid() AND role IN ('master','adm_financeiro','rh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid() AND role IN ('master','adm_financeiro','rh')
    )
  );

CREATE POLICY "comissio_metas_splits_admin_all"
  ON public.comissio_metas_splits FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid() AND role IN ('master','adm_financeiro','rh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid() AND role IN ('master','adm_financeiro','rh')
    )
  );
