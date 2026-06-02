-- MIGRATION 091: Adiciona motivo de rejeição de NF pelo fiscal
ALTER TABLE public.fiscal_tarefas
  ADD COLUMN IF NOT EXISTS motivo_rejeicao_fiscal TEXT;
