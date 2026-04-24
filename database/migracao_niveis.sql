-- ============================================================
-- MIGRAÇÃO: Descontos por Nível
-- Execute no SQL Editor do Supabase
-- ============================================================

-- 1. Adicionar colunas de desconto por nível em bicos
ALTER TABLE bicos ADD COLUMN IF NOT EXISTS desconto_nivel1 DECIMAL(10,3) NOT NULL DEFAULT 0;
ALTER TABLE bicos ADD COLUMN IF NOT EXISTS desconto_nivel2 DECIMAL(10,3) NOT NULL DEFAULT 0;

-- 2. Migrar descontos existentes (tabela descontos → desconto_nivel1 dos bicos)
UPDATE bicos b
SET desconto_nivel1 = COALESCE((
  SELECT d.valor FROM descontos d
  WHERE d.posto_id = b.posto_id AND d.produto_id = b.produto_id
  LIMIT 1
), 0);

-- 3. Adicionar nível ao cartão (0=sem desconto, 1=nível1, 2=nível2)
ALTER TABLE cartoes ADD COLUMN IF NOT EXISTS nivel INT NOT NULL DEFAULT 1;

-- 4. Verificação
SELECT 'bicos' AS tabela, COUNT(*) AS total,
  SUM(CASE WHEN desconto_nivel1 > 0 THEN 1 ELSE 0 END) AS com_nivel1
FROM bicos
UNION ALL
SELECT 'cartoes', COUNT(*), SUM(CASE WHEN nivel > 0 THEN 1 ELSE 0 END)
FROM cartoes;
