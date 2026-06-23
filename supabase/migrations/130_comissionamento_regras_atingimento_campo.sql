-- ─────────────────────────────────────────────────────────────────────────────
-- 130_comissionamento_regras_atingimento_campo.sql
--
-- Adiciona 'atingimento_meta' como 5ª opção de `realizado_campo` e `base_campo`.
--
-- Diferente dos outros 4 (faturamento/quantidade/lucro/mix), este NÃO é
-- agregado a partir das vendas filtradas — é o atingimento % calculado
-- pelo engine sobre a meta de referência da regra.
--
-- Quando selecionado:
--   • Como realizado_campo: o realizado VIRA o atingimento da meta_referencia
--     (puxado do mapa pré-calculado). Os realizado_filtros são ignorados.
--   • Como base_campo: a base do cálculo VIRA o atingimento. Útil em:
--       por_unidade → "R$ X por 1% atingido"
--       a_cada     → "R$ X a cada N% atingido"
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.comissio_regras
  DROP CONSTRAINT IF EXISTS comissio_regras_realizado_campo_check;
ALTER TABLE public.comissio_regras
  DROP CONSTRAINT IF EXISTS comissio_regras_base_campo_check;

ALTER TABLE public.comissio_regras
  ADD CONSTRAINT comissio_regras_realizado_campo_check
    CHECK (realizado_campo IN ('faturamento','quantidade','lucro','mix','atingimento_meta'));
ALTER TABLE public.comissio_regras
  ADD CONSTRAINT comissio_regras_base_campo_check
    CHECK (base_campo IN ('faturamento','quantidade','lucro','mix','atingimento_meta'));
