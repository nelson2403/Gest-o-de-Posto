-- ============================================================
-- MIGRATION 013: Estoque e Envios de Bobinas
-- Controle de bobinas na matriz e envios para os postos
-- ============================================================

-- Entradas de bobinas na matriz (quando chegam)
CREATE TABLE IF NOT EXISTS public.entradas_bobinas (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quantidade    INTEGER NOT NULL CHECK (quantidade > 0),
    recebido_por  TEXT NOT NULL,
    data_entrada  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    nota_fiscal   TEXT,
    observacoes   TEXT,
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Envios de bobinas da matriz para postos
CREATE TABLE IF NOT EXISTS public.envios_bobinas (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    posto_id      UUID NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
    quantidade    INTEGER NOT NULL CHECK (quantidade > 0),
    enviado_por   TEXT NOT NULL,
    data_envio    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    observacoes   TEXT,
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_entradas_bobinas_data ON public.entradas_bobinas(data_entrada);
CREATE INDEX IF NOT EXISTS idx_envios_bobinas_posto ON public.envios_bobinas(posto_id);
CREATE INDEX IF NOT EXISTS idx_envios_bobinas_data ON public.envios_bobinas(data_envio);

-- RLS
ALTER TABLE public.entradas_bobinas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.envios_bobinas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados podem tudo em entradas_bobinas"
    ON public.entradas_bobinas FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Autenticados podem tudo em envios_bobinas"
    ON public.envios_bobinas FOR ALL TO authenticated USING (true) WITH CHECK (true);
