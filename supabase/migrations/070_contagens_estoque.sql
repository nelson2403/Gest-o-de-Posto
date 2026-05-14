-- ─────────────────────────────────────────────────────────────────────────────
-- 070_contagens_estoque.sql
-- Tabelas para contagem física de estoque
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contagens_estoque (
  id                       UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id               UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  codigo_empresa_externo   TEXT        NOT NULL,
  posto_nome               TEXT        NOT NULL,
  grupo_id                 TEXT        NOT NULL,
  grupo_nome               TEXT        NOT NULL,
  data_contagem            DATE        NOT NULL DEFAULT CURRENT_DATE,
  usuario_id               UUID        REFERENCES auth.users(id),
  criado_em                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contagens_estoque_itens (
  id             UUID           DEFAULT gen_random_uuid() PRIMARY KEY,
  contagem_id    UUID           NOT NULL REFERENCES public.contagens_estoque(id) ON DELETE CASCADE,
  produto_id     BIGINT         NOT NULL,
  produto_nome   TEXT           NOT NULL,
  unid_med       TEXT           NOT NULL DEFAULT 'UN',
  qtd_sistema    NUMERIC(14,3)  NOT NULL DEFAULT 0,
  custo_medio    NUMERIC(14,4)  NOT NULL DEFAULT 0,
  qtd_contada    NUMERIC(14,3),
  criado_em      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contagens_empresa ON public.contagens_estoque(empresa_id);
CREATE INDEX IF NOT EXISTS idx_contagens_itens_contagem ON public.contagens_estoque_itens(contagem_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.contagens_estoque       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contagens_estoque_itens ENABLE ROW LEVEL SECURITY;

-- Cabeçalho: qualquer usuário autenticado da empresa pode criar/ler
CREATE POLICY "contagens_empresa_all" ON public.contagens_estoque
  FOR ALL TO authenticated
  USING    (empresa_id = get_user_empresa_id())
  WITH CHECK (empresa_id = get_user_empresa_id());

-- Itens: vinculados à contagem da empresa
CREATE POLICY "contagens_itens_empresa_all" ON public.contagens_estoque_itens
  FOR ALL TO authenticated
  USING (
    contagem_id IN (
      SELECT id FROM public.contagens_estoque
      WHERE empresa_id = get_user_empresa_id()
    )
  )
  WITH CHECK (
    contagem_id IN (
      SELECT id FROM public.contagens_estoque
      WHERE empresa_id = get_user_empresa_id()
    )
  );
