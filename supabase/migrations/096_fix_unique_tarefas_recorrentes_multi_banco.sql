-- 096_fix_unique_tarefas_recorrentes_multi_banco.sql
--
-- A constraint uq_tarefa_recorrente_usuario_posto_categoria impede dois bancos
-- no mesmo posto para o mesmo conciliador (duplicata de usuario+posto+categoria).
-- Com o suporte a multi-banco, a unicidade deve ser por
-- (usuario_id, posto_id, categoria, conta_bancaria_id) — garantindo que cada
-- combinação conciliador+posto+banco seja única, mas permitindo múltiplos bancos.

-- 1. Remove a constraint antiga
ALTER TABLE public.tarefas_recorrentes
  DROP CONSTRAINT IF EXISTS uq_tarefa_recorrente_usuario_posto_categoria;

-- 2. Remove a nova (caso já exista) e recria — garante idempotência
ALTER TABLE public.tarefas_recorrentes
  DROP CONSTRAINT IF EXISTS uq_tarefa_recorrente_usuario_posto_banco;

ALTER TABLE public.tarefas_recorrentes
  ADD CONSTRAINT uq_tarefa_recorrente_usuario_posto_banco
  UNIQUE NULLS NOT DISTINCT (usuario_id, posto_id, categoria, conta_bancaria_id);
