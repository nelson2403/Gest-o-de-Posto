-- =====================================================================
-- 038_marketing.sql
-- Módulo de Controle de Marketing
-- Tabelas, RLS, views, triggers e storage bucket
-- =====================================================================

-- ── 1. Limites por posto/ano ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_limites (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id                 UUID NOT NULL REFERENCES postos(id) ON DELETE CASCADE,
  ano                      INTEGER NOT NULL,
  limite_mensal_patrocinio NUMERIC(10,2) NOT NULL DEFAULT 200.00,
  limite_anual_patrocinio  NUMERIC(10,2) NOT NULL DEFAULT 2400.00,
  UNIQUE(posto_id, ano)
);

-- ── 2. Patrocínios ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_patrocinios (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id           UUID NOT NULL REFERENCES postos(id),
  valor              NUMERIC(10,2) NOT NULL,
  data_evento        DATE NOT NULL,
  patrocinado        TEXT NOT NULL,
  descricao          TEXT,
  documento_url      TEXT,
  status             TEXT NOT NULL DEFAULT 'pendente'
                       CHECK (status IN ('pendente','aprovado','reprovado')),
  aprovado_por       UUID REFERENCES usuarios(id),
  aprovado_em        TIMESTAMPTZ,
  motivo_reprovacao  TEXT,
  -- conciliação AutoSystem
  conciliado         BOOLEAN NOT NULL DEFAULT FALSE,
  movto_mlid_externo BIGINT,
  valor_externo      NUMERIC(10,2),
  divergencia        BOOLEAN NOT NULL DEFAULT FALSE,
  -- auditoria
  created_by         UUID NOT NULL REFERENCES usuarios(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Ações de marketing ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_acoes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo       TEXT NOT NULL,
  descricao    TEXT,
  valor_padrao NUMERIC(10,2) NOT NULL DEFAULT 150.00,
  data_acao    DATE NOT NULL,
  prazo_envio  DATE NOT NULL,
  criado_por   UUID NOT NULL REFERENCES usuarios(id),
  status       TEXT NOT NULL DEFAULT 'aberta'
                 CHECK (status IN ('aberta','encerrada','cancelada')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. Postos participantes de cada ação ────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_acao_postos (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acao_id            UUID NOT NULL REFERENCES marketing_acoes(id) ON DELETE CASCADE,
  posto_id           UUID NOT NULL REFERENCES postos(id),
  valor              NUMERIC(10,2),
  status             TEXT NOT NULL DEFAULT 'pendente'
                       CHECK (status IN ('pendente','enviado','aprovado','reprovado')),
  aprovado_por       UUID REFERENCES usuarios(id),
  aprovado_em        TIMESTAMPTZ,
  motivo_reprovacao  TEXT,
  -- conciliação
  conciliado         BOOLEAN NOT NULL DEFAULT FALSE,
  movto_mlid_externo BIGINT,
  valor_externo      NUMERIC(10,2),
  divergencia        BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(acao_id, posto_id)
);

-- ── 5. Comprovantes (patrocínio ou ação_posto) ───────────────────────
CREATE TABLE IF NOT EXISTS marketing_comprovantes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patrocinio_id  UUID REFERENCES marketing_patrocinios(id) ON DELETE CASCADE,
  acao_posto_id  UUID REFERENCES marketing_acao_postos(id) ON DELETE CASCADE,
  arquivo_url    TEXT NOT NULL,
  arquivo_nome   TEXT,
  tipo_arquivo   TEXT,
  valor          NUMERIC(10,2),
  descricao      TEXT,
  uploaded_by    UUID NOT NULL REFERENCES usuarios(id),
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_comprovante_ref CHECK (
    (patrocinio_id IS NOT NULL AND acao_posto_id IS NULL) OR
    (patrocinio_id IS NULL AND acao_posto_id IS NOT NULL)
  )
);

-- ── 6. Log de aprovações ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo       TEXT NOT NULL CHECK (tipo IN ('patrocinio','acao','comprovante')),
  ref_id     UUID NOT NULL,
  acao       TEXT NOT NULL,
  usuario_id UUID REFERENCES usuarios(id),
  detalhes   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 7. RLS ───────────────────────────────────────────────────────────
ALTER TABLE marketing_limites      ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_patrocinios  ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_acoes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_acao_postos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_comprovantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_logs         ENABLE ROW LEVEL SECURITY;

-- Helper: role do usuário logado
CREATE OR REPLACE FUNCTION mkt_auth_role()
RETURNS TEXT AS $$
  SELECT role FROM usuarios WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: posto_id do usuário logado (para gerentes)
CREATE OR REPLACE FUNCTION mkt_auth_posto_id()
RETURNS UUID AS $$
  SELECT posto_fechamento_id FROM usuarios WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- marketing_limites
DROP POLICY IF EXISTS "mkt_limites_select" ON marketing_limites;
DROP POLICY IF EXISTS "mkt_limites_write"  ON marketing_limites;
CREATE POLICY "mkt_limites_select" ON marketing_limites FOR SELECT TO authenticated
  USING (mkt_auth_role() IN ('master','admin','marketing') OR posto_id = mkt_auth_posto_id());
CREATE POLICY "mkt_limites_write"  ON marketing_limites FOR ALL    TO authenticated
  USING (mkt_auth_role() IN ('master','admin','marketing'))
  WITH CHECK (mkt_auth_role() IN ('master','admin','marketing'));

-- marketing_patrocinios
DROP POLICY IF EXISTS "mkt_pat_select" ON marketing_patrocinios;
DROP POLICY IF EXISTS "mkt_pat_insert" ON marketing_patrocinios;
DROP POLICY IF EXISTS "mkt_pat_update" ON marketing_patrocinios;
CREATE POLICY "mkt_pat_select" ON marketing_patrocinios FOR SELECT TO authenticated
  USING (mkt_auth_role() IN ('master','admin','marketing') OR posto_id = mkt_auth_posto_id());
CREATE POLICY "mkt_pat_insert" ON marketing_patrocinios FOR INSERT TO authenticated
  WITH CHECK (
    mkt_auth_role() IN ('master','admin','marketing') OR
    (mkt_auth_role() = 'operador' AND posto_id = mkt_auth_posto_id())
  );
CREATE POLICY "mkt_pat_update" ON marketing_patrocinios FOR UPDATE TO authenticated
  USING (
    mkt_auth_role() IN ('master','admin','marketing') OR
    (posto_id = mkt_auth_posto_id() AND status = 'pendente')
  );

-- marketing_acoes
DROP POLICY IF EXISTS "mkt_acao_select" ON marketing_acoes;
DROP POLICY IF EXISTS "mkt_acao_write"  ON marketing_acoes;
CREATE POLICY "mkt_acao_select" ON marketing_acoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "mkt_acao_write"  ON marketing_acoes FOR ALL    TO authenticated
  USING (mkt_auth_role() IN ('master','admin','marketing'))
  WITH CHECK (mkt_auth_role() IN ('master','admin','marketing'));

-- marketing_acao_postos
DROP POLICY IF EXISTS "mkt_ap_select" ON marketing_acao_postos;
DROP POLICY IF EXISTS "mkt_ap_update" ON marketing_acao_postos;
CREATE POLICY "mkt_ap_select" ON marketing_acao_postos FOR SELECT TO authenticated
  USING (mkt_auth_role() IN ('master','admin','marketing') OR posto_id = mkt_auth_posto_id());
CREATE POLICY "mkt_ap_update" ON marketing_acao_postos FOR UPDATE TO authenticated
  USING (
    mkt_auth_role() IN ('master','admin','marketing') OR
    (posto_id = mkt_auth_posto_id() AND status = 'pendente')
  );

-- marketing_comprovantes
DROP POLICY IF EXISTS "mkt_comp_select" ON marketing_comprovantes;
DROP POLICY IF EXISTS "mkt_comp_insert" ON marketing_comprovantes;
CREATE POLICY "mkt_comp_select" ON marketing_comprovantes FOR SELECT TO authenticated
  USING (mkt_auth_role() IN ('master','admin','marketing') OR uploaded_by = auth.uid());
CREATE POLICY "mkt_comp_insert" ON marketing_comprovantes FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

-- marketing_logs
DROP POLICY IF EXISTS "mkt_logs_select" ON marketing_logs;
CREATE POLICY "mkt_logs_select" ON marketing_logs FOR SELECT TO authenticated
  USING (mkt_auth_role() IN ('master','admin','marketing'));

-- ── 8. View: saldo mensal/anual por posto ────────────────────────────
CREATE OR REPLACE VIEW vw_marketing_saldo AS
SELECT
  p.id                                        AS posto_id,
  p.nome                                      AS posto_nome,
  EXTRACT(YEAR  FROM CURRENT_DATE)::int       AS ano,
  EXTRACT(MONTH FROM CURRENT_DATE)::int       AS mes,
  COALESCE(l.limite_mensal_patrocinio, 200.00)  AS limite_mensal,
  COALESCE(l.limite_anual_patrocinio,  2400.00) AS limite_anual,
  COALESCE((
    SELECT SUM(valor) FROM marketing_patrocinios
    WHERE posto_id = p.id AND status = 'aprovado'
      AND EXTRACT(YEAR  FROM data_evento) = EXTRACT(YEAR  FROM CURRENT_DATE)
      AND EXTRACT(MONTH FROM data_evento) = EXTRACT(MONTH FROM CURRENT_DATE)
  ), 0) AS gasto_mensal_patrocinio,
  COALESCE((
    SELECT SUM(valor) FROM marketing_patrocinios
    WHERE posto_id = p.id AND status = 'aprovado'
      AND EXTRACT(YEAR FROM data_evento) = EXTRACT(YEAR FROM CURRENT_DATE)
  ), 0) AS gasto_anual_patrocinio,
  COALESCE((
    SELECT SUM(COALESCE(ap.valor, a.valor_padrao))
    FROM marketing_acao_postos ap
    JOIN marketing_acoes a ON a.id = ap.acao_id
    WHERE ap.posto_id = p.id AND ap.status = 'aprovado'
      AND EXTRACT(YEAR  FROM a.data_acao) = EXTRACT(YEAR  FROM CURRENT_DATE)
      AND EXTRACT(MONTH FROM a.data_acao) = EXTRACT(MONTH FROM CURRENT_DATE)
  ), 0) AS gasto_mensal_acoes
FROM postos p
LEFT JOIN marketing_limites l
  ON l.posto_id = p.id
  AND l.ano = EXTRACT(YEAR FROM CURRENT_DATE)::int;

GRANT SELECT ON vw_marketing_saldo TO authenticated;

-- ── 9. Triggers: updated_at ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION mkt_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mkt_pat_updated ON marketing_patrocinios;
CREATE TRIGGER trg_mkt_pat_updated
  BEFORE UPDATE ON marketing_patrocinios
  FOR EACH ROW EXECUTE FUNCTION mkt_set_updated_at();

DROP TRIGGER IF EXISTS trg_mkt_acao_updated ON marketing_acoes;
CREATE TRIGGER trg_mkt_acao_updated
  BEFORE UPDATE ON marketing_acoes
  FOR EACH ROW EXECUTE FUNCTION mkt_set_updated_at();

-- ── 10. Índices ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mkt_pat_posto    ON marketing_patrocinios(posto_id);
CREATE INDEX IF NOT EXISTS idx_mkt_pat_status   ON marketing_patrocinios(status);
CREATE INDEX IF NOT EXISTS idx_mkt_pat_data     ON marketing_patrocinios(data_evento);
CREATE INDEX IF NOT EXISTS idx_mkt_ap_acao      ON marketing_acao_postos(acao_id);
CREATE INDEX IF NOT EXISTS idx_mkt_ap_posto     ON marketing_acao_postos(posto_id);
CREATE INDEX IF NOT EXISTS idx_mkt_comp_pat     ON marketing_comprovantes(patrocinio_id);
CREATE INDEX IF NOT EXISTS idx_mkt_comp_ap      ON marketing_comprovantes(acao_posto_id);
CREATE INDEX IF NOT EXISTS idx_mkt_logs_ref     ON marketing_logs(ref_id);
