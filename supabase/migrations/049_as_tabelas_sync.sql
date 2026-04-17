-- ============================================================
-- 049_as_tabelas_sync.sql
-- Tabelas espelho do AUTOSYSTEM (prefixo as_) + controle de sync
-- Populadas pelo serviço sync-autosystem rodando localmente
-- ============================================================

-- ── Controle de sincronização ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_controle (
  tabela                  TEXT PRIMARY KEY,
  ultima_sync             TIMESTAMPTZ,
  ultima_sync_completa    TIMESTAMPTZ,
  status                  TEXT NOT NULL DEFAULT 'pendente',  -- pendente | ok | erro
  registros_ultima_sync   INT  DEFAULT 0,
  erro                    TEXT,
  atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO sync_controle (tabela) VALUES
  ('as_empresa'),('as_conta'),('as_motivo_movto'),
  ('as_grupo_produto'),('as_subgrupo_produto'),
  ('as_cartao_concilia_produto'),('as_empresa_tef'),
  ('as_pessoa'),('as_produto'),
  ('as_movto'),('as_caixa'),('as_estoque_produto'),
  ('as_cartao_concilia_extrato'),('as_tef_transacao')
ON CONFLICT (tabela) DO NOTHING;

-- ── Tabelas estáticas ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS as_empresa (
  grid    BIGINT PRIMARY KEY,
  codigo  TEXT,
  nome    TEXT
);

CREATE TABLE IF NOT EXISTS as_conta (
  codigo  TEXT PRIMARY KEY,
  nome    TEXT
);

CREATE TABLE IF NOT EXISTS as_motivo_movto (
  grid  BIGINT PRIMARY KEY,
  nome  TEXT
);

CREATE TABLE IF NOT EXISTS as_grupo_produto (
  grid    BIGINT PRIMARY KEY,
  codigo  INT,
  nome    TEXT
);

CREATE TABLE IF NOT EXISTS as_subgrupo_produto (
  grid    BIGINT PRIMARY KEY,
  codigo  INT,
  nome    TEXT,
  grupo   BIGINT
);

CREATE TABLE IF NOT EXISTS as_cartao_concilia_produto (
  grid       BIGINT PRIMARY KEY,
  descricao  TEXT,
  taxa_perc  DOUBLE PRECISION
);

-- empresa_tef: sem coluna grid no AUTOSYSTEM — PK composta (empresa, codigo)
CREATE TABLE IF NOT EXISTS as_empresa_tef (
  empresa    BIGINT,
  codigo     TEXT,
  nome       TEXT,
  hospedado  BOOLEAN,
  PRIMARY KEY (empresa, codigo)
);

-- ── Tabelas semi-estáticas ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS as_pessoa (
  grid  BIGINT PRIMARY KEY,
  nome  TEXT
);

CREATE TABLE IF NOT EXISTS as_produto (
  grid             BIGINT PRIMARY KEY,
  codigo           TEXT,
  nome             TEXT,
  grupo            BIGINT,
  subgrupo         BIGINT,
  unid_med         TEXT,
  tipo_combustivel INT,
  flag             CHAR(1)
);

-- ── Tabelas incrementais ──────────────────────────────────────────────────────

-- movto: transações financeiras
-- PK: grid (mlid não é único no AUTOSYSTEM — pode ter duplicatas e NULLs)
CREATE TABLE IF NOT EXISTS as_movto (
  grid          BIGINT PRIMARY KEY,
  mlid          BIGINT,
  empresa       BIGINT,
  data          DATE,
  vencto        DATE,
  documento     TEXT,
  tipo_doc      TEXT,
  valor         DOUBLE PRECISION,
  conta_debitar  TEXT,
  conta_creditar TEXT,
  child          BIGINT,
  motivo        BIGINT,
  pessoa        BIGINT,
  obs           TEXT
);

CREATE INDEX IF NOT EXISTS idx_as_movto_empresa        ON as_movto (empresa);
CREATE INDEX IF NOT EXISTS idx_as_movto_data           ON as_movto (data);
CREATE INDEX IF NOT EXISTS idx_as_movto_vencto         ON as_movto (vencto);
CREATE INDEX IF NOT EXISTS idx_as_movto_conta_debitar  ON as_movto (conta_debitar);
CREATE INDEX IF NOT EXISTS idx_as_movto_empresa_vencto ON as_movto (empresa, vencto);
CREATE INDEX IF NOT EXISTS idx_as_movto_mlid           ON as_movto (mlid);

-- caixa: registros de abertura/fechamento de caixa por turno
-- PK: grid
CREATE TABLE IF NOT EXISTS as_caixa (
  grid           BIGINT PRIMARY KEY,
  empresa        BIGINT,
  data           DATE,
  turno          INT,
  codigo         INT,
  abertura       TIMESTAMPTZ,
  fechamento     TIMESTAMPTZ,
  conferencia    TIMESTAMPTZ,
  pessoa_confere BIGINT
);

CREATE INDEX IF NOT EXISTS idx_as_caixa_empresa ON as_caixa (empresa);
CREATE INDEX IF NOT EXISTS idx_as_caixa_data    ON as_caixa (data);

-- estoque_produto: saldo atual por (empresa, deposito, produto)
CREATE TABLE IF NOT EXISTS as_estoque_produto (
  empresa     BIGINT,
  deposito    BIGINT,
  produto     BIGINT,
  data        DATE,
  estoque     DOUBLE PRECISION,
  custo_medio DOUBLE PRECISION,
  PRIMARY KEY (empresa, deposito, produto)
);

CREATE INDEX IF NOT EXISTS idx_as_estoque_produto_empresa  ON as_estoque_produto (empresa);
CREATE INDEX IF NOT EXISTS idx_as_estoque_produto_produto  ON as_estoque_produto (produto);

-- cartao_concilia_extrato: resumos de conciliação por (empresa, data, produto)
-- Sem PK integer no AUTOSYSTEM — PK composta
CREATE TABLE IF NOT EXISTS as_cartao_concilia_extrato (
  empresa      BIGINT,
  data         DATE,
  produto      BIGINT,
  extrato      TEXT,
  autorizadora INT,
  PRIMARY KEY (empresa, data, produto)
);

CREATE INDEX IF NOT EXISTS idx_as_cce_empresa ON as_cartao_concilia_extrato (empresa);
CREATE INDEX IF NOT EXISTS idx_as_cce_data    ON as_cartao_concilia_extrato (data);

-- tef_transacao: transações TEF (maquininhas)
-- Sem coluna empresa — empresa é obtida via JOIN com caixa
CREATE TABLE IF NOT EXISTS as_tef_transacao (
  grid           BIGINT PRIMARY KEY,
  caixa          BIGINT,
  valor          DOUBLE PRECISION,
  nsu            TEXT,
  autorizacao    TEXT,
  operadora      INT,
  operadora_nome TEXT,
  bandeira       TEXT,
  status         TEXT,
  ts_local       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_as_tef_caixa ON as_tef_transacao (caixa);

-- ── RLS: desabilita (dados internos, sem acesso público) ──────────────────────
ALTER TABLE sync_controle              DISABLE ROW LEVEL SECURITY;
ALTER TABLE as_empresa                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE as_conta                   DISABLE ROW LEVEL SECURITY;
ALTER TABLE as_motivo_movto            DISABLE ROW LEVEL SECURITY;
ALTER TABLE as_grupo_produto           DISABLE ROW LEVEL SECURITY;
ALTER TABLE as_subgrupo_produto        DISABLE ROW LEVEL SECURITY;
ALTER TABLE as_cartao_concilia_produto DISABLE ROW LEVEL SECURITY;
ALTER TABLE as_empresa_tef             DISABLE ROW LEVEL SECURITY;
ALTER TABLE as_pessoa                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE as_produto                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE as_movto                   DISABLE ROW LEVEL SECURITY;
ALTER TABLE as_caixa                   DISABLE ROW LEVEL SECURITY;
ALTER TABLE as_estoque_produto         DISABLE ROW LEVEL SECURITY;
ALTER TABLE as_cartao_concilia_extrato DISABLE ROW LEVEL SECURITY;
ALTER TABLE as_tef_transacao           DISABLE ROW LEVEL SECURITY;
