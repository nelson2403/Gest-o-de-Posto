-- ============================================================
-- MIGRATION 001: SCHEMA INICIAL
-- Sistema de Gestão de Acessos - Postos de Combustível
-- ============================================================

-- Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABELA: EMPRESAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.empresas (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome          TEXT NOT NULL,
    cnpj          TEXT UNIQUE,
    email         TEXT,
    status        TEXT NOT NULL DEFAULT 'ativo'
                    CHECK (status IN ('ativo', 'inativo', 'suspenso')),
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: USUÁRIOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.usuarios (
    id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nome          TEXT NOT NULL,
    email         TEXT NOT NULL,
    empresa_id    UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
    role          TEXT NOT NULL DEFAULT 'operador'
                    CHECK (role IN ('master', 'admin', 'operador')),
    ativo         BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: POSTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.postos (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id    UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    nome          TEXT NOT NULL,
    cnpj          TEXT,
    endereco      TEXT,
    email         TEXT,
    senha_email   TEXT,
    ativo         BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: ADQUIRENTES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.adquirentes (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id    UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    nome          TEXT NOT NULL,
    ativo         BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: MAQUININHAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.maquininhas (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    posto_id        UUID NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
    adquirente_id   UUID NOT NULL REFERENCES public.adquirentes(id),
    numero_serie    TEXT,
    modelo          TEXT,
    status          TEXT NOT NULL DEFAULT 'ativo'
                      CHECK (status IN ('ativo', 'inativo', 'manutencao', 'extraviada')),
    motivo_status   TEXT,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: TAXAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.taxas (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    posto_id               UUID NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
    adquirente_id          UUID NOT NULL REFERENCES public.adquirentes(id),
    taxa_debito            NUMERIC(5, 2),
    taxa_credito           NUMERIC(5, 2),
    taxa_credito_parcelado NUMERIC(5, 2),
    observacoes            TEXT,
    criado_em              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (posto_id, adquirente_id)
);

-- ============================================================
-- TABELA: PORTAIS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.portais (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id    UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    nome          TEXT NOT NULL,
    url           TEXT,
    ativo         BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: ACESSOS ANYDESK
-- ============================================================
CREATE TABLE IF NOT EXISTS public.acessos_anydesk (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    posto_id        UUID NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
    numero_anydesk  TEXT NOT NULL,
    senha           TEXT,
    observacoes     TEXT,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: ACESSOS UNIFICADOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.acessos_unificados (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    posto_id      UUID NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
    portal_id     UUID NOT NULL REFERENCES public.portais(id),
    login         TEXT NOT NULL,
    senha         TEXT,
    observacoes   TEXT,
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: ACESSOS DOS POSTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.acessos_postos (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    posto_id      UUID NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
    portal_id     UUID NOT NULL REFERENCES public.portais(id),
    login         TEXT NOT NULL,
    senha         TEXT,
    observacoes   TEXT,
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: SERVIDORES DOS POSTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.servidores_postos (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    posto_id      UUID NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
    nome_banco    TEXT,
    ip            TEXT NOT NULL,
    porta         INTEGER DEFAULT 5432,
    usuario       TEXT,
    senha         TEXT,
    observacoes   TEXT,
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: CONTATOS DO POSTO
-- ============================================================
CREATE TABLE IF NOT EXISTS public.posto_contatos (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    posto_id    UUID NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
    nome        TEXT NOT NULL,
    telefone    TEXT,
    cargo       TEXT,
    principal   BOOLEAN DEFAULT FALSE,
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tabela           TEXT NOT NULL,
    registro_id      UUID,
    usuario_id       UUID REFERENCES public.usuarios(id),
    acao             TEXT NOT NULL,
    dados_anteriores JSONB,
    dados_novos      JSONB,
    criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_usuarios_empresa_id    ON public.usuarios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_postos_empresa_id      ON public.postos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_maquininhas_posto_id   ON public.maquininhas(posto_id);
CREATE INDEX IF NOT EXISTS idx_maquininhas_adq_id     ON public.maquininhas(adquirente_id);
CREATE INDEX IF NOT EXISTS idx_taxas_posto_id         ON public.taxas(posto_id);
CREATE INDEX IF NOT EXISTS idx_taxas_adq_id           ON public.taxas(adquirente_id);
CREATE INDEX IF NOT EXISTS idx_anydesk_posto          ON public.acessos_anydesk(posto_id);
CREATE INDEX IF NOT EXISTS idx_acessos_unif_posto     ON public.acessos_unificados(posto_id);
CREATE INDEX IF NOT EXISTS idx_acessos_postos_posto   ON public.acessos_postos(posto_id);
CREATE INDEX IF NOT EXISTS idx_servidores_posto       ON public.servidores_postos(posto_id);
CREATE INDEX IF NOT EXISTS idx_portais_empresa        ON public.portais(empresa_id);
CREATE INDEX IF NOT EXISTS idx_adquirentes_empresa    ON public.adquirentes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_audit_tabela           ON public.audit_logs(tabela, registro_id);
CREATE INDEX IF NOT EXISTS idx_audit_usuario          ON public.audit_logs(usuario_id);
CREATE INDEX IF NOT EXISTS idx_audit_criado_em        ON public.audit_logs(criado_em DESC);

-- ============================================================
-- FUNÇÃO: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_empresas_updated_at
    BEFORE UPDATE ON public.empresas
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_usuarios_updated_at
    BEFORE UPDATE ON public.usuarios
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_postos_updated_at
    BEFORE UPDATE ON public.postos
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_maquininhas_updated_at
    BEFORE UPDATE ON public.maquininhas
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_taxas_updated_at
    BEFORE UPDATE ON public.taxas
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_anydesk_updated_at
    BEFORE UPDATE ON public.acessos_anydesk
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_acessos_unif_updated_at
    BEFORE UPDATE ON public.acessos_unificados
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_acessos_postos_updated_at
    BEFORE UPDATE ON public.acessos_postos
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_servidores_updated_at
    BEFORE UPDATE ON public.servidores_postos
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- FUNÇÕES HELPER PARA RLS
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
    SELECT role FROM public.usuarios WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_user_empresa_id()
RETURNS UUID AS $$
    SELECT empresa_id FROM public.usuarios WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.empresas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.postos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adquirentes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maquininhas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portais            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acessos_anydesk    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acessos_unificados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acessos_postos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servidores_postos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posto_contatos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs         ENABLE ROW LEVEL SECURITY;

-- POLICIES: EMPRESAS
CREATE POLICY "master_all_empresas" ON public.empresas
    FOR ALL TO authenticated
    USING (get_user_role() = 'master')
    WITH CHECK (get_user_role() = 'master');

CREATE POLICY "user_own_empresa" ON public.empresas
    FOR SELECT TO authenticated
    USING (get_user_role() IN ('admin', 'operador') AND id = get_user_empresa_id());

-- POLICIES: USUÁRIOS
CREATE POLICY "master_all_usuarios" ON public.usuarios
    FOR ALL TO authenticated
    USING (get_user_role() = 'master')
    WITH CHECK (get_user_role() = 'master');

CREATE POLICY "admin_manage_operadores" ON public.usuarios
    FOR ALL TO authenticated
    USING (get_user_role() = 'admin' AND empresa_id = get_user_empresa_id() AND role = 'operador')
    WITH CHECK (get_user_role() = 'admin' AND empresa_id = get_user_empresa_id() AND role = 'operador');

CREATE POLICY "user_see_company_users" ON public.usuarios
    FOR SELECT TO authenticated
    USING (get_user_role() IN ('admin', 'operador') AND empresa_id = get_user_empresa_id());

-- POLICIES: POSTOS
CREATE POLICY "master_all_postos" ON public.postos
    FOR ALL TO authenticated
    USING (get_user_role() = 'master')
    WITH CHECK (get_user_role() = 'master');

CREATE POLICY "admin_manage_postos" ON public.postos
    FOR ALL TO authenticated
    USING (get_user_role() = 'admin' AND empresa_id = get_user_empresa_id())
    WITH CHECK (get_user_role() = 'admin' AND empresa_id = get_user_empresa_id());

CREATE POLICY "operador_read_postos" ON public.postos
    FOR SELECT TO authenticated
    USING (get_user_role() = 'operador' AND empresa_id = get_user_empresa_id());

-- POLICIES: ADQUIRENTES
CREATE POLICY "master_all_adquirentes" ON public.adquirentes
    FOR ALL TO authenticated USING (get_user_role() = 'master') WITH CHECK (get_user_role() = 'master');

CREATE POLICY "admin_manage_adquirentes" ON public.adquirentes
    FOR ALL TO authenticated
    USING (get_user_role() = 'admin' AND empresa_id = get_user_empresa_id())
    WITH CHECK (get_user_role() = 'admin' AND empresa_id = get_user_empresa_id());

CREATE POLICY "operador_read_adquirentes" ON public.adquirentes
    FOR SELECT TO authenticated
    USING (get_user_role() IN ('operador') AND empresa_id = get_user_empresa_id());

-- POLICIES: MAQUININHAS
CREATE POLICY "master_all_maquininhas" ON public.maquininhas
    FOR ALL TO authenticated USING (get_user_role() = 'master') WITH CHECK (get_user_role() = 'master');

CREATE POLICY "admin_manage_maquininhas" ON public.maquininhas
    FOR ALL TO authenticated
    USING (get_user_role() = 'admin' AND posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id()))
    WITH CHECK (get_user_role() = 'admin' AND posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id()));

CREATE POLICY "operador_read_maquininhas" ON public.maquininhas
    FOR SELECT TO authenticated
    USING (get_user_role() = 'operador' AND posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id()));

-- POLICIES: TAXAS
CREATE POLICY "master_all_taxas" ON public.taxas
    FOR ALL TO authenticated USING (get_user_role() = 'master') WITH CHECK (get_user_role() = 'master');

CREATE POLICY "admin_manage_taxas" ON public.taxas
    FOR ALL TO authenticated
    USING (get_user_role() = 'admin' AND posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id()))
    WITH CHECK (get_user_role() = 'admin' AND posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id()));

CREATE POLICY "operador_read_taxas" ON public.taxas
    FOR SELECT TO authenticated
    USING (get_user_role() = 'operador' AND posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id()));

-- POLICIES: PORTAIS
CREATE POLICY "master_all_portais" ON public.portais
    FOR ALL TO authenticated USING (get_user_role() = 'master') WITH CHECK (get_user_role() = 'master');

CREATE POLICY "admin_manage_portais" ON public.portais
    FOR ALL TO authenticated
    USING (get_user_role() = 'admin' AND empresa_id = get_user_empresa_id())
    WITH CHECK (get_user_role() = 'admin' AND empresa_id = get_user_empresa_id());

CREATE POLICY "operador_read_portais" ON public.portais
    FOR SELECT TO authenticated
    USING (get_user_role() = 'operador' AND empresa_id = get_user_empresa_id());

-- POLICIES: ACESSOS ANYDESK
CREATE POLICY "master_all_anydesk" ON public.acessos_anydesk
    FOR ALL TO authenticated USING (get_user_role() = 'master') WITH CHECK (get_user_role() = 'master');

CREATE POLICY "admin_manage_anydesk" ON public.acessos_anydesk
    FOR ALL TO authenticated
    USING (get_user_role() = 'admin' AND posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id()))
    WITH CHECK (get_user_role() = 'admin' AND posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id()));

CREATE POLICY "operador_read_anydesk" ON public.acessos_anydesk
    FOR SELECT TO authenticated
    USING (get_user_role() = 'operador' AND posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id()));

-- POLICIES: ACESSOS UNIFICADOS
CREATE POLICY "master_all_acessos_unif" ON public.acessos_unificados
    FOR ALL TO authenticated USING (get_user_role() = 'master') WITH CHECK (get_user_role() = 'master');

CREATE POLICY "admin_manage_acessos_unif" ON public.acessos_unificados
    FOR ALL TO authenticated
    USING (get_user_role() = 'admin' AND posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id()))
    WITH CHECK (get_user_role() = 'admin' AND posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id()));

CREATE POLICY "operador_rw_acessos_unif" ON public.acessos_unificados
    FOR ALL TO authenticated
    USING (get_user_role() = 'operador' AND posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id()))
    WITH CHECK (get_user_role() = 'operador' AND posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id()));

-- POLICIES: ACESSOS POSTOS
CREATE POLICY "master_all_acessos_postos" ON public.acessos_postos
    FOR ALL TO authenticated USING (get_user_role() = 'master') WITH CHECK (get_user_role() = 'master');

CREATE POLICY "admin_manage_acessos_postos" ON public.acessos_postos
    FOR ALL TO authenticated
    USING (get_user_role() = 'admin' AND posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id()))
    WITH CHECK (get_user_role() = 'admin' AND posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id()));

CREATE POLICY "operador_rw_acessos_postos" ON public.acessos_postos
    FOR ALL TO authenticated
    USING (get_user_role() = 'operador' AND posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id()))
    WITH CHECK (get_user_role() = 'operador' AND posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id()));

-- POLICIES: SERVIDORES
CREATE POLICY "master_all_servidores" ON public.servidores_postos
    FOR ALL TO authenticated USING (get_user_role() = 'master') WITH CHECK (get_user_role() = 'master');

CREATE POLICY "admin_manage_servidores" ON public.servidores_postos
    FOR ALL TO authenticated
    USING (get_user_role() = 'admin' AND posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id()))
    WITH CHECK (get_user_role() = 'admin' AND posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id()));

CREATE POLICY "operador_read_servidores" ON public.servidores_postos
    FOR SELECT TO authenticated
    USING (get_user_role() = 'operador' AND posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id()));

-- POLICIES: POSTO CONTATOS
CREATE POLICY "master_all_contatos" ON public.posto_contatos
    FOR ALL TO authenticated USING (get_user_role() = 'master') WITH CHECK (get_user_role() = 'master');

CREATE POLICY "admin_manage_contatos" ON public.posto_contatos
    FOR ALL TO authenticated
    USING (get_user_role() = 'admin' AND posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id()))
    WITH CHECK (get_user_role() = 'admin' AND posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id()));

CREATE POLICY "operador_read_contatos" ON public.posto_contatos
    FOR SELECT TO authenticated
    USING (get_user_role() = 'operador' AND posto_id IN (SELECT id FROM public.postos WHERE empresa_id = get_user_empresa_id()));

-- POLICIES: AUDIT LOGS
CREATE POLICY "master_admin_read_audit" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (get_user_role() IN ('master', 'admin'));

CREATE POLICY "insert_audit_logs" ON public.audit_logs
    FOR INSERT TO authenticated WITH CHECK (TRUE);
