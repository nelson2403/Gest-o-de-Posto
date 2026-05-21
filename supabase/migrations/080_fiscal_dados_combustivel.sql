-- 080_fiscal_dados_combustivel.sql
-- Adiciona campo JSONB para armazenar dados do descarregamento de combustível
-- Preenchido pelo gerente ao reconhecer NF de fornecedores de combustível

ALTER TABLE fiscal_tarefas
  ADD COLUMN IF NOT EXISTS dados_combustivel JSONB;
