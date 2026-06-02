-- Migration 092: Sistema de Fechamento de Caixa Eletrônico por Frentista

-- ── Frentistas (operadores de caixa) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.frentistas (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id           UUID NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  nome               TEXT NOT NULL,
  codigo             TEXT NOT NULL,          -- código de login (definido pelo admin)
  senha_hash         TEXT NOT NULL,          -- PBKDF2-SHA512 com salt embutido
  codigo_operador_as TEXT,                   -- código do operador no AUTOSYSTEM (caixa.codigo)
  ativo              BOOLEAN NOT NULL DEFAULT true,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (posto_id, codigo)
);

-- ── Configuração de campos por posto ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.frentista_campos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id     UUID NOT NULL UNIQUE REFERENCES public.postos(id) ON DELETE CASCADE,
  campos       JSONB NOT NULL DEFAULT '[]'::jsonb,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Sessões temporárias (12h) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.frentista_sessoes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  frentista_id  UUID NOT NULL REFERENCES public.frentistas(id) ON DELETE CASCADE,
  token         TEXT UNIQUE NOT NULL,
  expira_em     TIMESTAMPTZ NOT NULL,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Fechamentos realizados ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.frentista_fechamentos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id         UUID NOT NULL REFERENCES public.postos(id),
  frentista_id     UUID REFERENCES public.frentistas(id),
  frentista_nome   TEXT NOT NULL,
  data_fechamento  DATE NOT NULL,
  turno            TEXT,
  -- Itens: [{tipo, label, valor_as, valor_frentista, diferenca}]
  itens            JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_as         NUMERIC(15,2),
  total_frentista  NUMERIC(15,2),
  total_diferenca  NUMERIC(15,2),
  -- Assinatura
  assinatura_img   TEXT,     -- base64 PNG da tela canvas
  assinado_em      TIMESTAMPTZ,
  -- Status
  status           TEXT NOT NULL DEFAULT 'assinado'
                     CHECK (status IN ('assinado', 'revisado', 'cancelado')),
  observacao       TEXT,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Índices ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_frentistas_posto      ON public.frentistas(posto_id);
CREATE INDEX IF NOT EXISTS idx_frentista_sess_token  ON public.frentista_sessoes(token);
CREATE INDEX IF NOT EXISTS idx_frentista_fech_posto  ON public.frentista_fechamentos(posto_id);
CREATE INDEX IF NOT EXISTS idx_frentista_fech_data   ON public.frentista_fechamentos(data_fechamento);
CREATE INDEX IF NOT EXISTS idx_frentista_fech_frent  ON public.frentista_fechamentos(frentista_id);

-- ── RLS: admin client bypasses (todas as operações via service_role) ──────────
ALTER TABLE public.frentistas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frentista_campos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frentista_sessoes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frentista_fechamentos ENABLE ROW LEVEL SECURITY;

-- Master e ADMs veem tudo
CREATE POLICY "frentistas_master"
  ON public.frentistas FOR ALL TO authenticated
  USING (get_user_role() IN ('master', 'adm_financeiro', 'gerente'))
  WITH CHECK (get_user_role() IN ('master', 'adm_financeiro', 'gerente'));

CREATE POLICY "frentista_campos_master"
  ON public.frentista_campos FOR ALL TO authenticated
  USING (get_user_role() IN ('master', 'adm_financeiro', 'gerente'))
  WITH CHECK (get_user_role() IN ('master', 'adm_financeiro', 'gerente'));

CREATE POLICY "frentista_fech_master"
  ON public.frentista_fechamentos FOR ALL TO authenticated
  USING (get_user_role() IN ('master', 'adm_financeiro', 'gerente'))
  WITH CHECK (get_user_role() IN ('master', 'adm_financeiro', 'gerente'));

-- Sessões: apenas via service_role (sem política autenticada pública)
CREATE POLICY "frentista_sess_master"
  ON public.frentista_sessoes FOR ALL TO authenticated
  USING (get_user_role() = 'master')
  WITH CHECK (get_user_role() = 'master');

-- ── Trigger updated_at ────────────────────────────────────────────────────────
CREATE TRIGGER set_frentistas_atualizado_em
  BEFORE UPDATE ON public.frentistas
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── Limpeza automática de sessões expiradas (chamada manualmente ou cron) ─────
-- Pode ser executada: DELETE FROM frentista_sessoes WHERE expira_em < NOW();
