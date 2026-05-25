-- ─────────────────────────────────────────────────────────────────────────────
-- 080_comissionamento_regras_modo.sql
--
-- Refina o "ENTÃO faça isso" da regra com 3 modos exclusivos:
--
--   • sobre        — percentual aplicado sobre uma base categórica
--                    (Faturamento, Quantidade, Mix, Produto, Grupo, Subgrupo)
--                    ex.: 7% sobre o Faturamento
--   • por_unidade  — valor fixo em R$ por unidade vendida
--                    ex.: R$ 10,00 por unidade
--   • a_cada       — valor fixo em R$ a cada N reais de base (faixa)
--                    ex.: R$ 100,00 a cada R$ 1.000,00 faturados
--
-- Colunas adicionadas:
--   • resultado_modo        — texto, CHECK nas 3 opções acima
--   • resultado_base_valor  — numeric, usado só em 'a_cada' (em R$)
--
-- A coluna `resultado_tipo` continua existindo e passa a representar a
-- "base categórica" (usada quando modo = 'sobre'). Para modos
-- por_unidade e a_cada, o campo é ignorado pela UI (mas mantido por
-- compatibilidade de dados).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.comissio_regras
  ADD COLUMN IF NOT EXISTS resultado_modo        TEXT     NOT NULL DEFAULT 'sobre',
  ADD COLUMN IF NOT EXISTS resultado_base_valor  NUMERIC  NOT NULL DEFAULT 0;

ALTER TABLE public.comissio_regras
  DROP CONSTRAINT IF EXISTS comissio_regras_resultado_modo_check;

ALTER TABLE public.comissio_regras
  ADD CONSTRAINT comissio_regras_resultado_modo_check
  CHECK (resultado_modo IN ('sobre', 'por_unidade', 'a_cada'));

CREATE INDEX IF NOT EXISTS idx_comissio_regras_resultado_modo
  ON public.comissio_regras(resultado_modo);
