-- ─────────────────────────────────────────────────────────────────────────────
-- 091_comissionamento_regras_escopo.sql
--
-- Adiciona um "escopo" opcional na AÇÃO da regra (ENTÃO) — permite limitar
-- em quais vendas a comissão se aplica sem precisar repetir o filtro nas
-- condições. Semanticamente equivalente a colocar a condição
-- `produto/grupo/subgrupo = X` no painel SE; serve como syntactic sugar
-- para deixar a regra mais auto-descritiva.
--
-- Comportamento no engine:
--   • Se escopo_tipo/escopo_valor estão setados, a regra só casa quando o
--     campo da venda correspondente é igual a escopo_valor (case-insensitive).
--   • Se NULL ou vazio, a regra mantém o comportamento atual (sem filtro
--     extra de produto na ação).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.comissio_regras
  ADD COLUMN IF NOT EXISTS escopo_tipo  TEXT,
  ADD COLUMN IF NOT EXISTS escopo_valor TEXT NOT NULL DEFAULT '';

ALTER TABLE public.comissio_regras
  DROP CONSTRAINT IF EXISTS comissio_regras_escopo_tipo_check;

ALTER TABLE public.comissio_regras
  ADD CONSTRAINT comissio_regras_escopo_tipo_check
  CHECK (escopo_tipo IS NULL OR escopo_tipo IN ('produto', 'grupo_produto', 'subgrupo_produto'));

CREATE INDEX IF NOT EXISTS idx_comissio_regras_escopo_tipo
  ON public.comissio_regras (escopo_tipo)
  WHERE escopo_tipo IS NOT NULL;
