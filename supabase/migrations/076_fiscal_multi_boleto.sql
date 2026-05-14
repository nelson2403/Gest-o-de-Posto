-- Migration 076: Suporte a múltiplos boletos por nota fiscal
-- Adiciona coluna JSONB boletos[] e migra dados existentes

ALTER TABLE public.fiscal_tarefas
  ADD COLUMN IF NOT EXISTS boletos JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Migra boleto existente (campo único) para o novo array
UPDATE public.fiscal_tarefas
SET boletos = jsonb_build_array(
  jsonb_build_object(
    'url',        boleto_url,
    'nome',       'boleto.pdf',
    'vencimento', boleto_vencimento::text,
    'valor',      boleto_valor
  )
)
WHERE boleto_url IS NOT NULL
  AND boletos = '[]'::jsonb;
