-- ─────────────────────────────────────────────────────────────────────────────
-- 084_comissionamento_metas_filtros_multiplos.sql
--
-- A meta hoje aceita um único filtro (`filtro_tipo` + `filtro_valores` +
-- `filtro_modo`). Esta migration introduz suporte a MÚLTIPLOS filtros,
-- combinados por AND, em uma nova coluna `filtros jsonb`.
--
-- Formato esperado:
--   [
--     { "tipo": "produto"|"grupo_produto"|"subgrupo_produto"|"produto_tipo",
--       "valores": ["X","Y"],
--       "modo":   "incluir"|"excluir" }
--   ]
--
-- Backfill: para metas existentes com `filtro_tipo` definido, materializa
-- um array de 1 elemento equivalente em `filtros`. As colunas legadas são
-- preservadas — a UI/API/engine passam a usar exclusivamente `filtros`, e
-- a remoção das colunas antigas fica para uma migration futura sem pressa.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.comissio_metas
  ADD COLUMN IF NOT EXISTS filtros JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill: monta um único filtro a partir dos campos legados
UPDATE public.comissio_metas
   SET filtros = jsonb_build_array(
         jsonb_build_object(
           'tipo',    filtro_tipo,
           'valores', COALESCE(to_jsonb(filtro_valores), '[]'::jsonb),
           'modo',    filtro_modo
         )
       )
 WHERE filtros = '[]'::jsonb
   AND filtro_tipo IS NOT NULL
   AND filtro_valores IS NOT NULL
   AND array_length(filtro_valores, 1) > 0;
