-- ============================================================
-- MIGRATION 074: FISCAL TAREFAS — WORKFLOW GERENTE
-- Adiciona acao_gerente, itens_romaneio e status 'desconhecida'
-- ============================================================

-- Novo status para NF desconhecida pelo gerente
ALTER TABLE public.fiscal_tarefas
  DROP CONSTRAINT IF EXISTS fiscal_tarefas_status_check;

ALTER TABLE public.fiscal_tarefas
  ADD CONSTRAINT fiscal_tarefas_status_check CHECK (status IN (
    'pendente_gerente',
    'nf_rejeitada',
    'aguardando_fiscal',
    'desconhecida',
    'concluida'
  ));

-- Ação tomada pelo gerente
ALTER TABLE public.fiscal_tarefas
  ADD COLUMN IF NOT EXISTS acao_gerente TEXT
    CHECK (acao_gerente IN ('reconhecida', 'desconhecida'));

-- Itens do romaneio (lista dos itens da NF-e, editável pelo gerente)
ALTER TABLE public.fiscal_tarefas
  ADD COLUMN IF NOT EXISTS itens_romaneio JSONB;

-- Timestamp de quando o gerente respondeu
ALTER TABLE public.fiscal_tarefas
  ADD COLUMN IF NOT EXISTS gerente_respondeu_em TIMESTAMPTZ;

-- Índice para facilitar consulta por ação do gerente
CREATE INDEX IF NOT EXISTS idx_fiscal_tarefas_acao_gerente
  ON public.fiscal_tarefas(acao_gerente);
