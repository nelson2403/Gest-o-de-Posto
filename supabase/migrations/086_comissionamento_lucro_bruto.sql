-- ─────────────────────────────────────────────────────────────────────────────
-- 081_comissionamento_lucro_bruto.sql
--
-- A base categórica do modo "sobre" passa a ser restrita na UI a duas opções:
--   • Faturamento  (vendas_rs)
--   • Lucro Bruto  (lucro_bruto — NOVO)
--
-- Aqui apenas adicionamos `lucro_bruto` ao CHECK do `resultado_tipo`. Os
-- demais valores históricos (quantidade, mix, produto, grupo_produto,
-- subgrupo_produto) continuam aceitos pelo banco para não quebrar registros
-- antigos; a UI deixa de oferecê-los no select do modo "sobre".
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.comissio_regras
  DROP CONSTRAINT IF EXISTS comissio_regras_resultado_tipo_check;

ALTER TABLE public.comissio_regras
  ADD CONSTRAINT comissio_regras_resultado_tipo_check
  CHECK (resultado_tipo IN (
    'vendas_rs',
    'lucro_bruto',
    'quantidade',
    'mix',
    'produto',
    'grupo_produto',
    'subgrupo_produto'
  ));
