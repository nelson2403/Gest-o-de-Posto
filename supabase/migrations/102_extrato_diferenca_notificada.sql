-- Rastreia o valor da divergência que foi notificado por último para cada tarefa.
-- Permite re-notificar apenas quando o valor muda (em vez de bloquear após a 1ª notif).
ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS extrato_diferenca_notificada NUMERIC(15,2) DEFAULT NULL;

-- null  = nunca notificado
-- 0     = última notificação foi "resolvida"
-- valor = valor que estava na última notificação de divergência
