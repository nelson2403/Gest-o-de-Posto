-- Garante apenas um fechamento por frentista por dia.
-- Remove duplicatas existentes (mantém o mais recente) antes de criar o índice.

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY frentista_id, data_fechamento
           ORDER BY criado_em DESC
         ) AS rn
  FROM frentista_fechamentos
)
DELETE FROM frentista_fechamentos
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fechamento_frentista_dia
  ON frentista_fechamentos (frentista_id, data_fechamento);
