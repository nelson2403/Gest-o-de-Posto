-- ─────────────────────────────────────────────────────────────────────────────
-- 136_comissionamento_regras_modo_fixo.sql
--
-- Adiciona 'fixo' como 4º modo do ENTÃO. Antes só existiam:
--   • sobre        — % sobre uma base agregada
--   • por_unidade  — R$ por unidade vendida
--   • a_cada       — R$ a cada faixa de R$ na base
--
-- O modo 'fixo' paga um VALOR ABSOLUTO em R$ quando as condições do SE
-- forem atendidas — independente da base. Útil para regras tipo:
--   "Se atingimento ≥ 100% então R$ 100,00 (bônus fixo)"
--
-- No modo 'fixo' o engine ignora base_filtros/base_campo/base_escopo —
-- a comissão é simplesmente resultado_valor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.comissio_regras
  DROP CONSTRAINT IF EXISTS comissio_regras_resultado_modo_check;

ALTER TABLE public.comissio_regras
  ADD CONSTRAINT comissio_regras_resultado_modo_check
    CHECK (resultado_modo IN ('sobre', 'por_unidade', 'a_cada', 'fixo'));
