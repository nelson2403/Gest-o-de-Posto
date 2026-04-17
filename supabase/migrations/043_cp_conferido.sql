-- Adiciona campos de conferência manual e comparação com AutoSystem
ALTER TABLE cp_competencias
  ADD COLUMN IF NOT EXISTS conferido       BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS conferido_em    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conferido_por   UUID REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS status_as       TEXT CHECK (status_as IN ('encontrado','divergente','nao_encontrado')),
  ADD COLUMN IF NOT EXISTS situacao_as     TEXT;  -- 'pago', 'a_vencer', 'em_atraso' — situação no AS
