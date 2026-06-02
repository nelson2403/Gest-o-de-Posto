-- 098_fix_fiscal_tarefas_posto_id_null.sql
--
-- Corrige tarefas fiscais que foram importadas sem posto_id porque
-- o mapeamento empresa_grid → posto não estava disponível no momento
-- da importação. Faz o join via postos.codigo_empresa_externo.

UPDATE public.fiscal_tarefas ft
SET    posto_id     = p.id,
       atualizada_em = now()
FROM   public.postos p
WHERE  ft.posto_id IS NULL
  AND  ft.empresa_grid IS NOT NULL
  AND  p.codigo_empresa_externo IS NOT NULL
  AND  p.codigo_empresa_externo::text = ft.empresa_grid::text;
