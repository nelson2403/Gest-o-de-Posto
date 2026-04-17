-- ============================================================
-- 041_contas_pagar.sql — Módulo Contas a Pagar
-- ============================================================

-- Helper de role (mesmo padrão do marketing)
CREATE OR REPLACE FUNCTION cp_auth_role()
RETURNS TEXT AS $$
  SELECT role FROM usuarios WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── 1. Fornecedores ──────────────────────────────────────────
CREATE TABLE cp_fornecedores (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome        TEXT NOT NULL,
  cnpj        TEXT,
  categoria   TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cp_fornecedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cp_forn_select" ON cp_fornecedores FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "cp_forn_insert" ON cp_fornecedores FOR INSERT TO authenticated
  WITH CHECK (cp_auth_role() IN ('master','admin'));
CREATE POLICY "cp_forn_update" ON cp_fornecedores FOR UPDATE TO authenticated
  USING (cp_auth_role() IN ('master','admin'));
CREATE POLICY "cp_forn_delete" ON cp_fornecedores FOR DELETE TO authenticated
  USING (cp_auth_role() IN ('master','admin'));

-- ── 2. Contas Fixas ──────────────────────────────────────────
CREATE TABLE cp_contas_fixas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  posto_id        UUID NOT NULL REFERENCES postos(id) ON DELETE CASCADE,
  descricao       TEXT NOT NULL,
  categoria       TEXT NOT NULL CHECK (categoria IN (
    'energia','agua','internet','aluguel','telefone','gas',
    'seguro','contabilidade','folha','manutencao','outro'
  )),
  fornecedor_id   UUID REFERENCES cp_fornecedores(id),
  valor_estimado  NUMERIC(10,2) NOT NULL,
  dia_vencimento  SMALLINT NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 31),
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  obs             TEXT,
  criado_por      UUID NOT NULL REFERENCES usuarios(id),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cp_contas_fixas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cp_fixas_select" ON cp_contas_fixas FOR SELECT TO authenticated
  USING (cp_auth_role() IN ('master','admin','fechador','operador'));
CREATE POLICY "cp_fixas_insert" ON cp_contas_fixas FOR INSERT TO authenticated
  WITH CHECK (cp_auth_role() IN ('master','admin'));
CREATE POLICY "cp_fixas_update" ON cp_contas_fixas FOR UPDATE TO authenticated
  USING (cp_auth_role() IN ('master','admin'));
CREATE POLICY "cp_fixas_delete" ON cp_contas_fixas FOR DELETE TO authenticated
  USING (cp_auth_role() IN ('master','admin'));

-- ── 3. Competências (instâncias mensais das contas fixas) ────
CREATE TABLE cp_competencias (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conta_fixa_id    UUID NOT NULL REFERENCES cp_contas_fixas(id) ON DELETE CASCADE,
  posto_id         UUID NOT NULL REFERENCES postos(id),
  competencia      TEXT NOT NULL,  -- 'YYYY-MM'
  data_vencimento  DATE NOT NULL,
  valor_previsto   NUMERIC(10,2) NOT NULL,
  valor_pago       NUMERIC(10,2),
  status           TEXT NOT NULL DEFAULT 'previsto' CHECK (status IN (
    'previsto','pago','atraso','cancelado'
  )),
  data_pagamento   DATE,
  documento        TEXT,
  movto_mlid       BIGINT,
  valor_autosystem NUMERIC(10,2),
  obs              TEXT,
  pago_por         UUID REFERENCES usuarios(id),
  pago_em          TIMESTAMPTZ,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(conta_fixa_id, competencia)
);

ALTER TABLE cp_competencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cp_comp_select" ON cp_competencias FOR SELECT TO authenticated
  USING (cp_auth_role() IN ('master','admin','fechador','operador'));
CREATE POLICY "cp_comp_insert" ON cp_competencias FOR INSERT TO authenticated
  WITH CHECK (cp_auth_role() IN ('master','admin'));
CREATE POLICY "cp_comp_update" ON cp_competencias FOR UPDATE TO authenticated
  USING (cp_auth_role() IN ('master','admin','fechador'));
CREATE POLICY "cp_comp_delete" ON cp_competencias FOR DELETE TO authenticated
  USING (cp_auth_role() IN ('master','admin'));

-- ── 4. Lançamentos diários ───────────────────────────────────
CREATE TABLE cp_lancamentos (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  posto_id         UUID NOT NULL REFERENCES postos(id),
  data_lancamento  DATE NOT NULL,
  descricao        TEXT NOT NULL,
  valor            NUMERIC(10,2) NOT NULL,
  fornecedor_id    UUID REFERENCES cp_fornecedores(id),
  fornecedor_nome  TEXT,
  documento        TEXT,
  obs              TEXT,
  status           TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN (
    'pendente','encontrado','divergente','so_sistema','so_autosystem'
  )),
  movto_mlid       BIGINT,
  valor_autosystem NUMERIC(10,2),
  divergencia_valor NUMERIC(10,2),
  criado_por       UUID NOT NULL REFERENCES usuarios(id),
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cp_lancamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cp_lanc_select" ON cp_lancamentos FOR SELECT TO authenticated
  USING (cp_auth_role() IN ('master','admin','fechador','operador'));
CREATE POLICY "cp_lanc_insert" ON cp_lancamentos FOR INSERT TO authenticated
  WITH CHECK (cp_auth_role() IN ('master','admin','fechador','operador'));
CREATE POLICY "cp_lanc_update" ON cp_lancamentos FOR UPDATE TO authenticated
  USING (cp_auth_role() IN ('master','admin','fechador'));
CREATE POLICY "cp_lanc_delete" ON cp_lancamentos FOR DELETE TO authenticated
  USING (cp_auth_role() IN ('master','admin'));

-- ── Índices ──────────────────────────────────────────────────
CREATE INDEX idx_cp_fixas_posto      ON cp_contas_fixas(posto_id);
CREATE INDEX idx_cp_comp_posto       ON cp_competencias(posto_id);
CREATE INDEX idx_cp_comp_competencia ON cp_competencias(competencia);
CREATE INDEX idx_cp_comp_status      ON cp_competencias(status);
CREATE INDEX idx_cp_lanc_posto_data  ON cp_lancamentos(posto_id, data_lancamento);

-- ── Triggers updated_at ──────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.atualizado_em = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cp_fixas_updated_at') THEN
    CREATE TRIGGER trg_cp_fixas_updated_at BEFORE UPDATE ON cp_contas_fixas
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cp_comp_updated_at') THEN
    CREATE TRIGGER trg_cp_comp_updated_at BEFORE UPDATE ON cp_competencias
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cp_lanc_updated_at') THEN
    CREATE TRIGGER trg_cp_lanc_updated_at BEFORE UPDATE ON cp_lancamentos
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
