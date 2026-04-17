-- Torna posto_id opcional em acessos_unificados
-- pois acessos unificados valem para todos os postos
ALTER TABLE acessos_unificados
  ALTER COLUMN posto_id DROP NOT NULL;
