-- ─────────────────────────────────────────────────────────────────────────────
-- 092_comissionamento_regras_meta_referencia.sql
--
-- Adiciona referência opcional a uma meta específica para a condição de
-- `atingimento_meta` da regra. Quando preenchido, o engine usa o atingimento
-- DESSA meta no contexto de avaliação, independente de qual meta cobre cada
-- venda específica.
--
-- Caso de uso: Meta "Loja" exclui combustíveis e baldes do cálculo do
-- realizado. Você quer comissionar BALDES quando essa meta atinge 120%.
-- Sem este campo, vendas de baldes não têm meta atribuída (porque a meta
-- exclui baldes) e `atingimento_meta` retorna null. Com este campo:
--
--   Regra "4% sobre baldes ≥120%":
--     • meta_referencia_id = id da Meta Loja
--     • condição: atingimento_meta >= 120
--     • escopo da ação: subgrupo = BALDES LUBRIFICANTES
--
-- ON DELETE SET NULL — se a meta referenciada for removida, a regra fica
-- válida mas perde a referência; condições de atingimento passam a falhar
-- até o usuário escolher outra meta.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.comissio_regras
  ADD COLUMN IF NOT EXISTS meta_referencia_id UUID
    REFERENCES public.comissio_metas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_comissio_regras_meta_referencia
  ON public.comissio_regras (meta_referencia_id)
  WHERE meta_referencia_id IS NOT NULL;
