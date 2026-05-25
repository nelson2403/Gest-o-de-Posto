-- Migration 089: colunas de auditoria do envio de boleto ao CP
ALTER TABLE public.fiscal_tarefas
  ADD COLUMN IF NOT EXISTS boleto_enviado_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS boleto_enviado_por UUID REFERENCES public.usuarios(id);
