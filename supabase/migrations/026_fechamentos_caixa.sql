-- Migration 026: Sistema de Fechamento de Caixa
-- Tabelas para envio de fechamentos por posto, com arquivos e comentários

-- ─── Storage Bucket ───────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fechamentos-caixa',
  'fechamentos-caixa',
  false,
  52428800,  -- 50 MB por arquivo
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage (acesso autenticado ao bucket)
CREATE POLICY "fechamentos_upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fechamentos-caixa');

CREATE POLICY "fechamentos_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fechamentos-caixa');

CREATE POLICY "fechamentos_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'fechamentos-caixa');

-- ─── Tabela principal: fechamentos_caixa ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fechamentos_caixa (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id       UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    posto_id         UUID NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
    data_fechamento  DATE NOT NULL,
    status           TEXT NOT NULL DEFAULT 'rascunho'
                       CHECK (status IN ('rascunho', 'enviado', 'em_analise', 'aprovado', 'rejeitado')),
    -- Valores (todos opcionais — gerente preenche o que tiver)
    valor_dinheiro   NUMERIC(15, 2),
    valor_cheque     NUMERIC(15, 2),
    valor_pix        NUMERIC(15, 2),
    valor_debito     NUMERIC(15, 2),
    valor_credito    NUMERIC(15, 2),
    observacoes      TEXT,
    -- Controle
    criado_por       UUID NOT NULL REFERENCES public.usuarios(id),
    criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Arquivos anexados ao fechamento ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fechamento_arquivos (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fechamento_id    UUID NOT NULL REFERENCES public.fechamentos_caixa(id) ON DELETE CASCADE,
    tipo             TEXT NOT NULL DEFAULT 'outro'
                       CHECK (tipo IN ('deposito', 'cheque', 'comprovante_pix', 'fechamento_caixa', 'outro')),
    nome_original    TEXT NOT NULL,
    caminho_storage  TEXT NOT NULL,   -- caminho completo no bucket
    tamanho_bytes    BIGINT,
    mime_type        TEXT,
    criado_por       UUID NOT NULL REFERENCES public.usuarios(id),
    criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Comentários / thread de comunicação ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fechamento_comentarios (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fechamento_id  UUID NOT NULL REFERENCES public.fechamentos_caixa(id) ON DELETE CASCADE,
    usuario_id     UUID NOT NULL REFERENCES public.usuarios(id),
    mensagem       TEXT NOT NULL,
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Índices ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fechamentos_empresa   ON public.fechamentos_caixa(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fechamentos_posto     ON public.fechamentos_caixa(posto_id);
CREATE INDEX IF NOT EXISTS idx_fechamentos_status    ON public.fechamentos_caixa(status);
CREATE INDEX IF NOT EXISTS idx_fechamentos_data      ON public.fechamentos_caixa(data_fechamento);
CREATE INDEX IF NOT EXISTS idx_fechamentos_criado    ON public.fechamentos_caixa(criado_por);

CREATE INDEX IF NOT EXISTS idx_fech_arq_fechamento  ON public.fechamento_arquivos(fechamento_id);
CREATE INDEX IF NOT EXISTS idx_fech_com_fechamento  ON public.fechamento_comentarios(fechamento_id);

-- ─── Trigger updated_at ───────────────────────────────────────────────────────
CREATE TRIGGER set_fechamentos_caixa_atualizado_em
    BEFORE UPDATE ON public.fechamentos_caixa
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE public.fechamentos_caixa    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fechamento_arquivos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fechamento_comentarios ENABLE ROW LEVEL SECURITY;

-- ── fechamentos_caixa ─────────────────────────────────────────────────────────

-- Master: acesso total
CREATE POLICY "fechamentos_master_all"
    ON public.fechamentos_caixa FOR ALL TO authenticated
    USING    (get_user_role() = 'master')
    WITH CHECK (get_user_role() = 'master');

-- Admin: tudo dentro da própria empresa
CREATE POLICY "fechamentos_admin_all"
    ON public.fechamentos_caixa FOR ALL TO authenticated
    USING    (get_user_role() = 'admin' AND empresa_id = get_user_empresa_id())
    WITH CHECK (get_user_role() = 'admin' AND empresa_id = get_user_empresa_id());

-- Operador: ver e criar/editar fechamentos da própria empresa
CREATE POLICY "fechamentos_operador_all"
    ON public.fechamentos_caixa FOR ALL TO authenticated
    USING    (get_user_role() = 'operador' AND empresa_id = get_user_empresa_id())
    WITH CHECK (get_user_role() = 'operador' AND empresa_id = get_user_empresa_id());

-- Conciliador: somente leitura — apenas fechamentos já enviados/em análise/aprovados
CREATE POLICY "fechamentos_conciliador_select"
    ON public.fechamentos_caixa FOR SELECT TO authenticated
    USING (
        get_user_role() = 'conciliador'
        AND empresa_id = get_user_empresa_id()
        AND status IN ('enviado', 'em_analise', 'aprovado')
    );

-- ── fechamento_arquivos ───────────────────────────────────────────────────────

-- Master
CREATE POLICY "fech_arq_master_all"
    ON public.fechamento_arquivos FOR ALL TO authenticated
    USING    (get_user_role() = 'master')
    WITH CHECK (get_user_role() = 'master');

-- Admin/Operador/Conciliador — leitura via join com fechamento da empresa
CREATE POLICY "fech_arq_empresa_select"
    ON public.fechamento_arquivos FOR SELECT TO authenticated
    USING (
        get_user_role() IN ('admin', 'operador', 'conciliador')
        AND fechamento_id IN (
            SELECT id FROM public.fechamentos_caixa
            WHERE empresa_id = get_user_empresa_id()
        )
    );

-- Admin/Operador — inserção
CREATE POLICY "fech_arq_empresa_insert"
    ON public.fechamento_arquivos FOR INSERT TO authenticated
    WITH CHECK (
        get_user_role() IN ('admin', 'operador')
        AND fechamento_id IN (
            SELECT id FROM public.fechamentos_caixa
            WHERE empresa_id = get_user_empresa_id()
        )
    );

-- Admin/Operador — exclusão
CREATE POLICY "fech_arq_empresa_delete"
    ON public.fechamento_arquivos FOR DELETE TO authenticated
    USING (
        get_user_role() IN ('admin', 'operador')
        AND fechamento_id IN (
            SELECT id FROM public.fechamentos_caixa
            WHERE empresa_id = get_user_empresa_id()
        )
    );

-- ── fechamento_comentarios ────────────────────────────────────────────────────

-- Master
CREATE POLICY "fech_com_master_all"
    ON public.fechamento_comentarios FOR ALL TO authenticated
    USING    (get_user_role() = 'master')
    WITH CHECK (get_user_role() = 'master');

-- Admin/Operador — leitura
CREATE POLICY "fech_com_empresa_select"
    ON public.fechamento_comentarios FOR SELECT TO authenticated
    USING (
        get_user_role() IN ('admin', 'operador')
        AND fechamento_id IN (
            SELECT id FROM public.fechamentos_caixa
            WHERE empresa_id = get_user_empresa_id()
        )
    );

-- Admin/Operador — inserção
CREATE POLICY "fech_com_empresa_insert"
    ON public.fechamento_comentarios FOR INSERT TO authenticated
    WITH CHECK (
        get_user_role() IN ('admin', 'operador')
        AND fechamento_id IN (
            SELECT id FROM public.fechamentos_caixa
            WHERE empresa_id = get_user_empresa_id()
        )
    );

-- Conciliador — leitura de comentários de fechamentos visíveis
CREATE POLICY "fech_com_conciliador_select"
    ON public.fechamento_comentarios FOR SELECT TO authenticated
    USING (
        get_user_role() = 'conciliador'
        AND fechamento_id IN (
            SELECT id FROM public.fechamentos_caixa
            WHERE empresa_id = get_user_empresa_id()
              AND status IN ('enviado', 'em_analise', 'aprovado')
        )
    );
