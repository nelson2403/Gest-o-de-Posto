-- 097_rename_conciliacao_bancaria_to_sicoob.sql
--
-- Renomeia as tarefas legado de "Conciliação Bancária" para "Conciliação Sicoob"
-- nas tarefas_recorrentes e nas tarefas geradas.

UPDATE public.tarefas_recorrentes
SET
  titulo   = REPLACE(titulo,   'Conciliação Bancária', 'Conciliação Sicoob'),
  descricao = REPLACE(descricao, 'lançamentos bancários', 'extrato Sicoob')
WHERE categoria = 'conciliacao_bancaria'
  AND titulo LIKE 'Conciliação Bancária%';

UPDATE public.tarefas
SET
  titulo   = REPLACE(titulo,   'Conciliação Bancária', 'Conciliação Sicoob'),
  descricao = REPLACE(descricao, 'lançamentos bancários', 'extrato Sicoob')
WHERE categoria = 'conciliacao_bancaria'
  AND titulo LIKE 'Conciliação Bancária%';
