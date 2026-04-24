-- ============================================================
-- SCHEMA - Sistema de Cartão de Desconto para Postos
-- Banco: Supabase (PostgreSQL)
-- ============================================================

-- Habilitar extensão UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- POSTOS
-- ============================================================
CREATE TABLE postos (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome          VARCHAR(255) NOT NULL,
    endereco      VARCHAR(255),
    forecourt_ip  VARCHAR(50),
    forecourt_port INT,
    online        BOOLEAN DEFAULT FALSE,
    criado_em     TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PRODUTOS (tipos de combustível)
-- ============================================================
CREATE TABLE produtos (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome      VARCHAR(100) NOT NULL,
    ativo     BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- BICOS (bombas de combustível)
-- ============================================================
CREATE TABLE bicos (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bico_forecourt   INT NOT NULL,
    posto_id         UUID NOT NULL REFERENCES postos(id) ON DELETE CASCADE,
    produto_id       UUID NOT NULL REFERENCES produtos(id),
    descricao        VARCHAR(255),
    decimais         INT DEFAULT 3,
    preco_base       DECIMAL(10,3) NOT NULL DEFAULT 0,
    criado_em        TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(posto_id, bico_forecourt)
);

-- ============================================================
-- DESCONTOS (valor fixo por posto + produto)
-- Ex: Posto A → Gasolina → R$ 0,30 de desconto
-- ============================================================
CREATE TABLE descontos (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    posto_id      UUID NOT NULL REFERENCES postos(id) ON DELETE CASCADE,
    produto_id    UUID NOT NULL REFERENCES produtos(id),
    valor         DECIMAL(10,3) NOT NULL DEFAULT 0,
    criado_em     TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(posto_id, produto_id)
);

-- ============================================================
-- CARTÕES (cartões RFID dos funcionários)
-- ============================================================
CREATE TABLE cartoes (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo           VARCHAR(32) NOT NULL,
    nome_funcionario VARCHAR(255) NOT NULL,
    ativo            BOOLEAN DEFAULT TRUE,
    sincronizado     BOOLEAN DEFAULT FALSE,
    posto_id         UUID NOT NULL REFERENCES postos(id) ON DELETE CASCADE,
    criado_em        TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(posto_id, codigo)
);

-- ============================================================
-- USUÁRIOS
-- ============================================================
CREATE TABLE usuarios (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    senha_hash    VARCHAR(255) NOT NULL,
    nome          VARCHAR(255),
    role          INT DEFAULT 0,
    -- 0 = operador (só vê seu posto)
    -- 1 = gerente  (vê seu posto + relatórios)
    -- 2 = admin    (acesso total)
    posto_id      UUID REFERENCES postos(id),
    -- NULL = admin (acesso a todos os postos)
    ativo         BOOLEAN DEFAULT TRUE,
    criado_em     TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- VENDAS (abastecimentos — alimentado pelo serviço Python)
-- ============================================================
CREATE TABLE vendas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    posto_id        UUID REFERENCES postos(id),
    serial          VARCHAR(100),
    bico            VARCHAR(20),
    produto_nome    VARCHAR(100),
    volume          DECIMAL(10,3),
    preco_unitario  DECIMAL(10,3),
    total           DECIMAL(10,3),
    atendente       VARCHAR(255),
    cliente         VARCHAR(255),
    km              VARCHAR(50),
    realizado_em    TIMESTAMPTZ,
    criado_em       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AUDITORIA (log de quem mudou o quê e quando)
-- ============================================================
CREATE TABLE auditoria (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id    UUID REFERENCES usuarios(id),
    usuario_email VARCHAR(255),
    acao          VARCHAR(100) NOT NULL,
    -- Ex: 'PRECO_ATUALIZADO', 'CARTAO_CRIADO', 'CARTAO_DESATIVADO'
    entidade      VARCHAR(100) NOT NULL,
    entidade_id   UUID,
    dados_antes   JSONB,
    dados_depois  JSONB,
    criado_em     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES — performance
-- ============================================================
CREATE INDEX idx_bicos_posto        ON bicos(posto_id);
CREATE INDEX idx_bicos_produto      ON bicos(produto_id);
CREATE INDEX idx_descontos_posto    ON descontos(posto_id);
CREATE INDEX idx_cartoes_posto      ON cartoes(posto_id);
CREATE INDEX idx_cartoes_ativo      ON cartoes(ativo);
CREATE INDEX idx_cartoes_sinc       ON cartoes(sincronizado);
CREATE INDEX idx_vendas_posto       ON vendas(posto_id);
CREATE INDEX idx_vendas_data        ON vendas(realizado_em);
CREATE INDEX idx_auditoria_usuario  ON auditoria(usuario_id);
CREATE INDEX idx_auditoria_data     ON auditoria(criado_em);

-- ============================================================
-- TRIGGERS — atualizar atualizado_em automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_postos_ts
    BEFORE UPDATE ON postos
    FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

CREATE TRIGGER trg_bicos_ts
    BEFORE UPDATE ON bicos
    FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

CREATE TRIGGER trg_descontos_ts
    BEFORE UPDATE ON descontos
    FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

CREATE TRIGGER trg_cartoes_ts
    BEFORE UPDATE ON cartoes
    FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

CREATE TRIGGER trg_usuarios_ts
    BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

-- ============================================================
-- ROW LEVEL SECURITY (Supabase)
-- Habilitar RLS mas deixar o backend (service role) passar tudo
-- ============================================================
ALTER TABLE postos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bicos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE descontos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cartoes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios   ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria  ENABLE ROW LEVEL SECURITY;

-- O backend usa a service_role key que bypassa o RLS
-- Políticas abaixo são para o anon/authenticated se usar direto do frontend
CREATE POLICY "service_role_bypass" ON postos    USING (TRUE);
CREATE POLICY "service_role_bypass" ON produtos   USING (TRUE);
CREATE POLICY "service_role_bypass" ON bicos      USING (TRUE);
CREATE POLICY "service_role_bypass" ON descontos  USING (TRUE);
CREATE POLICY "service_role_bypass" ON cartoes    USING (TRUE);
CREATE POLICY "service_role_bypass" ON usuarios   USING (TRUE);
CREATE POLICY "service_role_bypass" ON vendas     USING (TRUE);
CREATE POLICY "service_role_bypass" ON auditoria  USING (TRUE);

-- ============================================================
-- SEED — dados iniciais
-- ============================================================

-- Produtos padrão
INSERT INTO produtos (nome) VALUES
    ('Gasolina Comum'),
    ('Gasolina Aditivada'),
    ('Diesel S10'),
    ('Diesel Comum'),
    ('Etanol');

-- Usuário admin padrão (senha: Admin@123 — TROQUE NO PRIMEIRO ACESSO)
-- Hash bcrypt gerado externamente
INSERT INTO usuarios (email, senha_hash, nome, role, posto_id) VALUES
    ('admin@sistema.com', '$2b$12$placeholder_troque_este_hash', 'Administrador', 2, NULL);
