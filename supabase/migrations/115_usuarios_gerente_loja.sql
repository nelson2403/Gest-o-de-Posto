-- Migration 115: marca gerentes de LOJA (conveniência)
-- Gerente de loja não tem acesso à Medição de Tanques.

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS gerente_loja BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
