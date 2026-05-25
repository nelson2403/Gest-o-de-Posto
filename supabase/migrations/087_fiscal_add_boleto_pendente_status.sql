-- Migration 087: adiciona status boleto_pendente ao constraint de fiscal_tarefas
ALTER TABLE public.fiscal_tarefas
  DROP CONSTRAINT IF EXISTS fiscal_tarefas_status_check;

ALTER TABLE public.fiscal_tarefas
  ADD CONSTRAINT fiscal_tarefas_status_check CHECK (status IN (
    'pendente_gerente',
    'nf_rejeitada',
    'aguardando_fiscal',
    'boleto_pendente',
    'desconhecida',
    'concluida'
  ));
