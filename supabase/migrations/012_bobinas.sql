-- Migration 012: Sistema de Controle de Bobinas

-- Garante que a função de atualização automática existe
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.solicitacoes_bobinas (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    posto_id         UUID NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
    maquininha_id    UUID NOT NULL REFERENCES public.maquininhas(id) ON DELETE CASCADE,
    solicitado_por   TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'pendente'
                       CHECK (status IN ('pendente', 'atendida', 'cancelada')),
    observacoes      TEXT,
    criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.trocas_bobinas (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    solicitacao_id   UUID REFERENCES public.solicitacoes_bobinas(id) ON DELETE SET NULL,
    posto_id         UUID NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
    maquininha_id    UUID NOT NULL REFERENCES public.maquininhas(id) ON DELETE CASCADE,
    realizado_por    TEXT NOT NULL,
    data_troca       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    observacoes      TEXT,
    criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_solicitacoes_bobinas_posto ON public.solicitacoes_bobinas(posto_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_bobinas_status ON public.solicitacoes_bobinas(status);
CREATE INDEX IF NOT EXISTS idx_trocas_bobinas_posto ON public.trocas_bobinas(posto_id);
CREATE INDEX IF NOT EXISTS idx_trocas_bobinas_maquininha ON public.trocas_bobinas(maquininha_id);
CREATE INDEX IF NOT EXISTS idx_trocas_bobinas_data ON public.trocas_bobinas(data_troca);

CREATE TRIGGER set_solicitacoes_bobinas_atualizado_em
    BEFORE UPDATE ON public.solicitacoes_bobinas
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.solicitacoes_bobinas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trocas_bobinas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados podem tudo em solicitacoes_bobinas"
    ON public.solicitacoes_bobinas FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Autenticados podem tudo em trocas_bobinas"
    ON public.trocas_bobinas FOR ALL TO authenticated USING (true) WITH CHECK (true);
