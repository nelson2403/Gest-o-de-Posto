-- ─────────────────────────────────────────────────────────────────────────────
-- 086_comissionamento_categorias_produto.sql
--
-- Cadastro central de categorias de produto para uso em metas de mix
-- (e potencialmente em análises futuras). Cada categoria é apenas uma
-- coleção nomeada de produtos do AUTOSYSTEM. Um mesmo produto pode
-- pertencer a múltiplas categorias (relação N:N).
--
-- Exemplos típicos:
--   • "Gasolina Aditivada"  → [GASOLINA ADITIVADA, GASOLINA ADITIVADA PREMIUM]
--   • "Gasolina Comum"      → [GASOLINA COMUM]
--   • "Gasolinas"           → [GASOLINA COMUM, GASOLINA ADITIVADA, ...]
--
-- A meta de mix passa a usar essas categorias:
--   • mix_numerador_categoria_id   → categoria foco (ex.: aditivada)
--   • mix_denominador_categoria_id → categoria universo (ex.: gasolinas)
--   Realizado = Σ qtd(numerador) ÷ Σ qtd(denominador) × 100
--
-- Os campos `mix_numerador`/`mix_denominador` (text[]) introduzidos pela
-- migration 085 são preservados como fallback — usados apenas quando
-- nenhuma categoria está vinculada à meta.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── comissio_categorias_produto ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comissio_categorias_produto (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          TEXT NOT NULL,
  descricao     TEXT NOT NULL DEFAULT '',
  cor           TEXT NOT NULL DEFAULT '#6366f1',
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por    UUID REFERENCES public.usuarios(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_comissio_categorias_nome
  ON public.comissio_categorias_produto (lower(nome));

CREATE OR REPLACE FUNCTION public.touch_comissio_categorias_produto()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS comissio_categorias_produto_touch ON public.comissio_categorias_produto;
CREATE TRIGGER comissio_categorias_produto_touch
  BEFORE UPDATE ON public.comissio_categorias_produto
  FOR EACH ROW EXECUTE FUNCTION public.touch_comissio_categorias_produto();

-- ── comissio_categoria_produtos (N:N) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comissio_categoria_produtos (
  categoria_id  UUID NOT NULL REFERENCES public.comissio_categorias_produto(id) ON DELETE CASCADE,
  produto_grid  BIGINT NOT NULL,
  produto_nome  TEXT NOT NULL,                   -- snapshot do nome (display)
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (categoria_id, produto_grid)
);

CREATE INDEX IF NOT EXISTS idx_comissio_categoria_produtos_categoria
  ON public.comissio_categoria_produtos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_comissio_categoria_produtos_produto
  ON public.comissio_categoria_produtos(produto_grid);

-- ── FKs na meta ──────────────────────────────────────────────────────────────
ALTER TABLE public.comissio_metas
  ADD COLUMN IF NOT EXISTS mix_numerador_categoria_id   UUID
    REFERENCES public.comissio_categorias_produto(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mix_denominador_categoria_id UUID
    REFERENCES public.comissio_categorias_produto(id) ON DELETE SET NULL;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS antes de cada CREATE para manter idempotência —
-- permite reaplicar a migration mesmo após uma execução parcial anterior.
ALTER TABLE public.comissio_categorias_produto  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissio_categoria_produtos  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comissio_categorias_produto_select_authenticated"
  ON public.comissio_categorias_produto;
CREATE POLICY "comissio_categorias_produto_select_authenticated"
  ON public.comissio_categorias_produto FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "comissio_categoria_produtos_select_authenticated"
  ON public.comissio_categoria_produtos;
CREATE POLICY "comissio_categoria_produtos_select_authenticated"
  ON public.comissio_categoria_produtos FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "comissio_categorias_produto_admin_all"
  ON public.comissio_categorias_produto;
CREATE POLICY "comissio_categorias_produto_admin_all"
  ON public.comissio_categorias_produto FOR ALL TO authenticated
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

DROP POLICY IF EXISTS "comissio_categoria_produtos_admin_all"
  ON public.comissio_categoria_produtos;
CREATE POLICY "comissio_categoria_produtos_admin_all"
  ON public.comissio_categoria_produtos FOR ALL TO authenticated
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
