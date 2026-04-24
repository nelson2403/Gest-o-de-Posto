-- ============================================================
-- AJUSTES PÓS-MIGRAÇÃO
-- Execute no SQL Editor do Supabase
-- ============================================================

-- 1. Renomear "Funcionário N" → "Cartão N"
UPDATE cartoes
SET nome_funcionario = REPLACE(nome_funcionario, 'Funcionário ', 'Cartão ')
WHERE nome_funcionario LIKE 'Funcionário %';

-- 2. Adicionar rastreamento de uso de cartão
ALTER TABLE cartoes ADD COLUMN IF NOT EXISTS total_usos INT NOT NULL DEFAULT 0;
ALTER TABLE cartoes ADD COLUMN IF NOT EXISTS ultimo_uso TIMESTAMPTZ;

-- Verificação
SELECT nome_funcionario, total_usos, ultimo_uso FROM cartoes ORDER BY nome_funcionario LIMIT 10;
