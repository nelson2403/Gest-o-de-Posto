-- 099_fix_fiscal_tarefas_status_null.sql
--
-- 1. Corrige tarefas com status NULL que impediam a importação em batch
--    (NULL NOT IN ('a','b') = desconhecido em SQL, não capturado pela query)
UPDATE public.fiscal_tarefas
SET    status        = 'pendente_gerente',
       atualizada_em = now()
WHERE  status IS NULL;

-- 2. Promove o índice único existente a uma constraint formal
--    (necessário para ON CONFLICT funcionar via PostgREST/Supabase)
ALTER TABLE public.fiscal_tarefas
  ADD CONSTRAINT fiscal_tarefas_nfe_resumo_grid_unique
  UNIQUE USING INDEX idx_fiscal_tarefas_nfe_grid_unique;
