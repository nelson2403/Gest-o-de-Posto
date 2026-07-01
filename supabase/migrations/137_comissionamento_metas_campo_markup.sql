-- ─────────────────────────────────────────────────────────────────────────────
-- 133_comissionamento_metas_campo_markup.sql
--
-- Adiciona 'markup' como novo tipo de meta. Diferente da margem
-- (lucro / faturamento × 100), o markup é a marcação sobre o custo:
--   markup = lucro / custo × 100
--
-- Útil para conveniência, onde a política de preço é definida em termos
-- de "quanto acima do custo" cada produto vai a mercado. Regras de
-- comissionamento podem usar `atingimento_meta` normal para pagar quando
-- a meta de markup for alcançada.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.comissio_metas
  DROP CONSTRAINT IF EXISTS comissio_metas_campo_check;

ALTER TABLE public.comissio_metas
  ADD CONSTRAINT comissio_metas_campo_check
    CHECK (campo IN ('faturamento', 'quantidade', 'margem', 'mix', 'markup'));
