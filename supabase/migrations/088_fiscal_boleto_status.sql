-- Migration 088: boleto_status independente do status principal da tarefa fiscal
-- Fluxo: NF lançada → status=concluida + boleto_status=pendente (se tiver boleto)
-- Fiscal envia ao CP → boleto_status=enviado_cp (status permanece concluida)

ALTER TABLE public.fiscal_tarefas
  ADD COLUMN IF NOT EXISTS boleto_status TEXT
    CHECK (boleto_status IN ('pendente', 'enviado_cp'));

-- Migra tarefas existentes em boleto_pendente → concluida + boleto_status=pendente
UPDATE public.fiscal_tarefas
SET status = 'concluida', boleto_status = 'pendente'
WHERE status = 'boleto_pendente';

CREATE INDEX IF NOT EXISTS idx_fiscal_tarefas_boleto_status
  ON public.fiscal_tarefas(boleto_status) WHERE boleto_status IS NOT NULL;
