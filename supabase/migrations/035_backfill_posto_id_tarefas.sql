-- =====================================================================
-- 035_backfill_posto_id_tarefas.sql
-- Corrige tarefas com posto_id = NULL que têm tarefa_recorrente_id
-- com posto_id configurado.
-- =====================================================================

UPDATE tarefas t
SET posto_id = tr.posto_id
FROM tarefas_recorrentes tr
WHERE t.tarefa_recorrente_id = tr.id
  AND t.posto_id IS NULL
  AND tr.posto_id IS NOT NULL;
