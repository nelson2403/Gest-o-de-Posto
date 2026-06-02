-- Migration 104: Adicionar campo is_uso_consumo em fiscal_tarefas

ALTER TABLE public.fiscal_tarefas ADD COLUMN IF NOT EXISTS is_uso_consumo boolean DEFAULT false;

-- Índice para facilitar filtros por uso e consumo
CREATE INDEX IF NOT EXISTS idx_fiscal_tarefas_uso_consumo ON public.fiscal_tarefas(is_uso_consumo) WHERE is_uso_consumo = true;
