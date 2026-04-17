-- Adiciona coluna de valor de aluguel na tabela maquininhas
ALTER TABLE maquininhas
  ADD COLUMN IF NOT EXISTS valor_aluguel NUMERIC(10, 2) DEFAULT NULL;

COMMENT ON COLUMN maquininhas.valor_aluguel IS 'Valor mensal de aluguel da maquininha (R$)';
