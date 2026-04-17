-- Garante que a função de atualização de timestamp existe
CREATE OR REPLACE FUNCTION update_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TABELA: CONTAS BANCÁRIAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contas_bancarias (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    posto_id      UUID REFERENCES public.postos(id) ON DELETE CASCADE,
    empresa_id    UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
    banco         TEXT NOT NULL,
    agencia       TEXT NOT NULL,
    conta         TEXT NOT NULL,
    observacoes   TEXT,
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contas_bancarias_posto   ON public.contas_bancarias(posto_id);
CREATE INDEX IF NOT EXISTS idx_contas_bancarias_empresa ON public.contas_bancarias(empresa_id);

DROP TRIGGER IF EXISTS trg_contas_bancarias_updated ON public.contas_bancarias;
CREATE TRIGGER trg_contas_bancarias_updated
    BEFORE UPDATE ON public.contas_bancarias
    FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

ALTER TABLE public.contas_bancarias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "master_all_contas_bancarias"   ON public.contas_bancarias;
DROP POLICY IF EXISTS "admin_manage_contas_bancarias" ON public.contas_bancarias;
DROP POLICY IF EXISTS "operador_read_contas_bancarias" ON public.contas_bancarias;

CREATE POLICY "master_all_contas_bancarias" ON public.contas_bancarias
    FOR ALL TO authenticated USING (get_user_role() = 'master') WITH CHECK (get_user_role() = 'master');

CREATE POLICY "admin_manage_contas_bancarias" ON public.contas_bancarias
    FOR ALL TO authenticated
    USING (get_user_role() = 'admin' AND empresa_id = get_user_empresa_id())
    WITH CHECK (get_user_role() = 'admin' AND empresa_id = get_user_empresa_id());

CREATE POLICY "operador_read_contas_bancarias" ON public.contas_bancarias
    FOR SELECT TO authenticated
    USING (get_user_role() = 'operador' AND empresa_id = get_user_empresa_id());

-- ============================================================
-- TABELA: ACESSOS CÂMERAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.acessos_cameras (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    posto_id      UUID REFERENCES public.postos(id) ON DELETE CASCADE,
    empresa_id    UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
    tipo          TEXT NOT NULL DEFAULT 'ip' CHECK (tipo IN ('icloud', 'ip')),
    endereco      TEXT NOT NULL,
    usuario       TEXT,
    senha         TEXT,
    porta         INTEGER,
    observacoes   TEXT,
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acessos_cameras_posto   ON public.acessos_cameras(posto_id);
CREATE INDEX IF NOT EXISTS idx_acessos_cameras_empresa ON public.acessos_cameras(empresa_id);

DROP TRIGGER IF EXISTS trg_acessos_cameras_updated ON public.acessos_cameras;
CREATE TRIGGER trg_acessos_cameras_updated
    BEFORE UPDATE ON public.acessos_cameras
    FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

ALTER TABLE public.acessos_cameras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "master_all_cameras"   ON public.acessos_cameras;
DROP POLICY IF EXISTS "admin_manage_cameras" ON public.acessos_cameras;
DROP POLICY IF EXISTS "operador_read_cameras" ON public.acessos_cameras;

CREATE POLICY "master_all_cameras" ON public.acessos_cameras
    FOR ALL TO authenticated USING (get_user_role() = 'master') WITH CHECK (get_user_role() = 'master');

CREATE POLICY "admin_manage_cameras" ON public.acessos_cameras
    FOR ALL TO authenticated
    USING (get_user_role() = 'admin' AND empresa_id = get_user_empresa_id())
    WITH CHECK (get_user_role() = 'admin' AND empresa_id = get_user_empresa_id());

CREATE POLICY "operador_read_cameras" ON public.acessos_cameras
    FOR SELECT TO authenticated
    USING (get_user_role() = 'operador' AND empresa_id = get_user_empresa_id());
