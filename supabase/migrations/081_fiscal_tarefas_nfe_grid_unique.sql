-- Remove duplicatas mantendo o registro mais antigo por nfe_resumo_grid
DELETE FROM fiscal_tarefas
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY nfe_resumo_grid ORDER BY criada_em ASC) AS rn
    FROM fiscal_tarefas
    WHERE nfe_resumo_grid IS NOT NULL
  ) t
  WHERE rn > 1
);

-- Índice único parcial: impede duplicatas futuras (ignora NULLs automaticamente)
CREATE UNIQUE INDEX IF NOT EXISTS idx_fiscal_tarefas_nfe_grid_unique
  ON fiscal_tarefas (nfe_resumo_grid)
  WHERE nfe_resumo_grid IS NOT NULL;
