-- =====================================================================
-- 033: Adiciona numero_logico à tabela maquininhas
-- Execute no Supabase SQL Editor
-- =====================================================================

ALTER TABLE public.maquininhas
  ADD COLUMN IF NOT EXISTS numero_logico TEXT;

COMMENT ON COLUMN public.maquininhas.numero_logico IS
  'Número lógico do TEF (campo "codigo" em empresa_tef no banco externo) para cruzamento de transações';
