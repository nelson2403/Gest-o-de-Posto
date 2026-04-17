-- =====================================================================
-- 046_conferencia_caixa.sql
-- Conferência de Caixa: AUTOSYSTEM → Extrato Bancário
-- Lê automaticamente os depósitos de caixa do AUTOSYSTEM
-- (motivo_movto grids: 6706=Sangria, 29771151=Brinks, 55142291=Cofre)
-- e cruza com os extratos bancários já anexados no sistema.
-- =====================================================================

CREATE TABLE IF NOT EXISTS caixa_depositos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID REFERENCES empresas(id) ON DELETE CASCADE,
  posto_id          UUID REFERENCES postos(id) ON DELETE CASCADE,
  empresa_grid      BIGINT NOT NULL,           -- grid do AUTOSYSTEM
  data_deposito     DATE NOT NULL,
  tipo              TEXT NOT NULL CHECK (tipo IN ('brinks', 'cofre_pombal', 'deposito_direto')),
  motivo_grid       BIGINT NOT NULL,            -- 6706 / 29771151 / 55142291
  motivo_nome       TEXT,                       -- nome do motivo_movto
  valor_autosystem  NUMERIC(15,2) NOT NULL,    -- soma dos movtos no AS

  -- Conciliação com extrato bancário
  status             TEXT NOT NULL DEFAULT 'pendente'
                      CHECK (status IN ('pendente', 'confirmado', 'divergente')),
  valor_extrato      NUMERIC(15,2),             -- extrato_movimento da tarefa
  data_extrato       DATE,                      -- data em que apareceu no banco
  tarefa_id          UUID REFERENCES tarefas(id) ON DELETE SET NULL,
  diferenca          NUMERIC(15,2) GENERATED ALWAYS AS (
                       CASE WHEN valor_extrato IS NOT NULL
                            THEN ROUND(valor_extrato - valor_autosystem, 2)
                            ELSE NULL END
                     ) STORED,

  -- Ajuste manual (quando necessário)
  ajuste_manual     BOOLEAN NOT NULL DEFAULT FALSE,
  ajuste_obs        TEXT,
  ajustado_por      UUID REFERENCES usuarios(id),
  ajustado_em       TIMESTAMPTZ,

  -- Controle de sincronização
  sincronizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sincronizado_por  UUID REFERENCES usuarios(id),

  UNIQUE (empresa_grid, data_deposito, motivo_grid)
);

CREATE INDEX IF NOT EXISTS idx_caixa_dep_posto    ON caixa_depositos(posto_id);
CREATE INDEX IF NOT EXISTS idx_caixa_dep_data     ON caixa_depositos(data_deposito);
CREATE INDEX IF NOT EXISTS idx_caixa_dep_status   ON caixa_depositos(status);
CREATE INDEX IF NOT EXISTS idx_caixa_dep_empresa  ON caixa_depositos(empresa_grid);

ALTER TABLE caixa_depositos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "caixa_dep_select" ON caixa_depositos FOR SELECT TO authenticated USING (true);
CREATE POLICY "caixa_dep_insert" ON caixa_depositos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "caixa_dep_update" ON caixa_depositos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "caixa_dep_delete" ON caixa_depositos FOR DELETE TO authenticated USING (true);
