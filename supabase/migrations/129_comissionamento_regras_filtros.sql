-- ─────────────────────────────────────────────────────────────────────────────
-- 129_comissionamento_regras_filtros.sql
--
-- Reestruturação para o modelo "comissão por vendedor agregado".
--
-- Acrescenta filtros INDEPENDENTES para:
--   • SE   (realizado_filtros + realizado_campo) — define quais vendas
--          entram no cálculo do realizado da meta de referência.
--   • ENTÃO (base_filtros + base_campo) — define quais vendas entram na
--          base do cálculo da comissão.
--
-- Cada filtro segue o formato ProductFilter já usado no esquema/meta:
--   { tipo: 'produto'|'grupo_produto'|'subgrupo_produto'|'produto_tipo',
--     valores: string[],
--     modo: 'incluir'|'excluir' }
--
-- Múltiplos filtros combinam por AND.
--
-- ── Campos válidos ─────────────────────────────────────────────────────────
--   faturamento  = soma de valor_total
--   quantidade   = soma de quantidade
--   lucro        = soma de (valor_total − custo_medio_unitario × quantidade)
--   mix          = nº de produtos distintos no conjunto filtrado
--
-- ── Backward compatibility ─────────────────────────────────────────────────
-- Os campos antigos (escopo_tipo, escopo_valor) continuam no banco para
-- auditoria, mas o engine novo os ignora. Para evitar regressão visual em
-- regras antigas com escopo, fazemos backfill copiando o escopo para
-- base_filtros (como filtro de inclusão).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.comissio_regras
  ADD COLUMN IF NOT EXISTS realizado_filtros JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS realizado_campo   TEXT  NOT NULL DEFAULT 'faturamento',
  ADD COLUMN IF NOT EXISTS base_filtros      JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS base_campo        TEXT  NOT NULL DEFAULT 'faturamento';

ALTER TABLE public.comissio_regras
  DROP CONSTRAINT IF EXISTS comissio_regras_realizado_campo_check;
ALTER TABLE public.comissio_regras
  DROP CONSTRAINT IF EXISTS comissio_regras_base_campo_check;

ALTER TABLE public.comissio_regras
  ADD CONSTRAINT comissio_regras_realizado_campo_check
    CHECK (realizado_campo IN ('faturamento','quantidade','lucro','mix'));
ALTER TABLE public.comissio_regras
  ADD CONSTRAINT comissio_regras_base_campo_check
    CHECK (base_campo IN ('faturamento','quantidade','lucro','mix'));

-- Backfill: regras existentes com escopo configurado herdam base_filtros
-- equivalente. Só executa para regras com base_filtros ainda vazio
-- (idempotente — re-executar a migration não duplica).
UPDATE public.comissio_regras
SET base_filtros = jsonb_build_array(
  jsonb_build_object(
    'tipo',    escopo_tipo,
    'valores', jsonb_build_array(escopo_valor),
    'modo',    'incluir'
  )
)
WHERE escopo_tipo IS NOT NULL
  AND escopo_valor <> ''
  AND base_filtros = '[]'::jsonb;
