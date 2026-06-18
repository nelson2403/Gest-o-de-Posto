-- ─────────────────────────────────────────────────────────────────────────────
-- 085_comissionamento_metas_mix.sql
--
-- Suporte a metas de mix (participação de um subconjunto em relação a um
-- universo). Exemplo:
--   Mix gasolina aditivada = (qtd_gasolina_aditivada) / (qtd_gasolina_aditivada + qtd_gasolina_comum) * 100
--
-- Para isso a meta precisa de DOIS conjuntos de produtos:
--   • mix_numerador   — produtos que somam no numerador (foco do mix)
--   • mix_denominador — produtos que somam no denominador (universo total).
--     O numerador deve ser subconjunto do denominador, mas o sistema não
--     impõe isso: cabe ao cadastro garantir a coerência.
--
-- Quando `campo` ≠ 'mix', os dois campos ficam NULL.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.comissio_metas
  ADD COLUMN IF NOT EXISTS mix_numerador    TEXT[],
  ADD COLUMN IF NOT EXISTS mix_denominador  TEXT[];
