-- ─────────────────────────────────────────────────────────────────────────────
-- 131_comissionamento_regras_escopo_total.sql
--
-- Adiciona suporte a regras que avaliam realizado e/ou base sobre TODAS as
-- vendas do posto, não apenas as do vendedor sendo processado. Resolve o
-- caso do gerente / supervisor:
--
--   • O gerente não vende — `vendedor_id` no AUTOSYSTEM nunca aponta pra ele
--   • A meta dele é a meta global (não um split individual)
--   • A comissão dele é sobre o faturamento da loja (não dele individualmente)
--
-- Com este patch a regra do gerente fica:
--   • realizado_escopo = 'todos' → atingimento_meta usa o atingimento total da meta
--   • base_escopo      = 'todos' → base do cálculo é o faturamento agregado
--
-- Default 'vendedor' = comportamento atual (1 comissão por vendedor com vendas).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.comissio_regras
  ADD COLUMN IF NOT EXISTS realizado_escopo TEXT NOT NULL DEFAULT 'vendedor',
  ADD COLUMN IF NOT EXISTS base_escopo      TEXT NOT NULL DEFAULT 'vendedor';

ALTER TABLE public.comissio_regras
  DROP CONSTRAINT IF EXISTS comissio_regras_realizado_escopo_check;
ALTER TABLE public.comissio_regras
  DROP CONSTRAINT IF EXISTS comissio_regras_base_escopo_check;

ALTER TABLE public.comissio_regras
  ADD CONSTRAINT comissio_regras_realizado_escopo_check
    CHECK (realizado_escopo IN ('vendedor','todos'));
ALTER TABLE public.comissio_regras
  ADD CONSTRAINT comissio_regras_base_escopo_check
    CHECK (base_escopo IN ('vendedor','todos'));
