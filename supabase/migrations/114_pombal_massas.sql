-- Migration 114: Módulo POMBAL MASSAS (produção e distribuição de salgados)

-- ── Salgados (produtos finais) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.salgados (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          TEXT NOT NULL,
  unidade       TEXT NOT NULL DEFAULT 'un',     -- un, cento, kg
  preco_venda   NUMERIC(12,2) NOT NULL DEFAULT 0,
  custo         NUMERIC(12,2) NOT NULL DEFAULT 0,  -- custo (manual ou calculado pela ficha)
  estoque       NUMERIC(12,3) NOT NULL DEFAULT 0,
  ativo         BOOLEAN NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Matérias-primas (insumos) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.salgados_insumos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome           TEXT NOT NULL,
  unidade        TEXT NOT NULL DEFAULT 'kg',     -- kg, un, L, g
  custo_unitario NUMERIC(12,4) NOT NULL DEFAULT 0,
  estoque        NUMERIC(12,3) NOT NULL DEFAULT 0,
  ativo          BOOLEAN NOT NULL DEFAULT true,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Ficha técnica / receita (Fase 2): insumo por salgado ──────────────────────
CREATE TABLE IF NOT EXISTS public.salgados_ficha (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salgado_id  UUID NOT NULL REFERENCES public.salgados(id) ON DELETE CASCADE,
  insumo_id   UUID NOT NULL REFERENCES public.salgados_insumos(id) ON DELETE CASCADE,
  quantidade  NUMERIC(12,4) NOT NULL DEFAULT 0,  -- qtd de insumo para 1 unidade do salgado
  UNIQUE (salgado_id, insumo_id)
);

-- ── Produção (Fase 2): entra salgado, sai insumo ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.salgados_producao (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salgado_id  UUID NOT NULL REFERENCES public.salgados(id),
  quantidade  NUMERIC(12,3) NOT NULL,
  custo_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  data        DATE NOT NULL DEFAULT CURRENT_DATE,
  observacao  TEXT,
  criado_por  UUID REFERENCES public.usuarios(id),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Pedidos das lojas (Fase 3) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.salgados_pedidos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id         UUID NOT NULL REFERENCES public.postos(id),  -- a loja que pede
  status           TEXT NOT NULL DEFAULT 'solicitado'
                     CHECK (status IN ('solicitado','aprovado','em_producao','entregue','cancelado')),
  solicitado_por   UUID REFERENCES public.usuarios(id),
  observacao       TEXT,
  data_solicitacao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data_entrega     TIMESTAMPTZ,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.salgados_pedido_itens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id      UUID NOT NULL REFERENCES public.salgados_pedidos(id) ON DELETE CASCADE,
  salgado_id     UUID NOT NULL REFERENCES public.salgados(id),
  quantidade     NUMERIC(12,3) NOT NULL,
  preco_unitario NUMERIC(12,2) NOT NULL DEFAULT 0
);

-- ── Movimentações de estoque de salgados ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.salgados_estoque_mov (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salgado_id  UUID NOT NULL REFERENCES public.salgados(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('producao','pedido','ajuste','entrada','saida')),
  quantidade  NUMERIC(12,3) NOT NULL,   -- positivo = entrada, negativo = saída
  ref_id      UUID,                      -- referência (producao_id ou pedido_id)
  observacao  TEXT,
  criado_por  UUID REFERENCES public.usuarios(id),
  data        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Índices ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_salgados_ativo        ON public.salgados(ativo);
CREATE INDEX IF NOT EXISTS idx_salgados_insumos_ativo ON public.salgados_insumos(ativo);
CREATE INDEX IF NOT EXISTS idx_salg_ficha_salgado    ON public.salgados_ficha(salgado_id);
CREATE INDEX IF NOT EXISTS idx_salg_prod_salgado     ON public.salgados_producao(salgado_id);
CREATE INDEX IF NOT EXISTS idx_salg_ped_posto        ON public.salgados_pedidos(posto_id);
CREATE INDEX IF NOT EXISTS idx_salg_ped_status       ON public.salgados_pedidos(status);
CREATE INDEX IF NOT EXISTS idx_salg_ped_item_pedido  ON public.salgados_pedido_itens(pedido_id);
CREATE INDEX IF NOT EXISTS idx_salg_mov_salgado      ON public.salgados_estoque_mov(salgado_id);

-- ── RLS (acesso via service_role nas rotas; políticas como rede de segurança) ──
ALTER TABLE public.salgados              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salgados_insumos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salgados_ficha        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salgados_producao     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salgados_pedidos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salgados_pedido_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salgados_estoque_mov  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'salgados','salgados_insumos','salgados_ficha','salgados_producao',
    'salgados_pedidos','salgados_pedido_itens','salgados_estoque_mov'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (get_user_role() IN (''master'',''adm_financeiro'',''gerente''))
         WITH CHECK (get_user_role() IN (''master'',''adm_financeiro'',''gerente''))',
      t || '_acesso', t
    );
  END LOOP;
END $$;

-- ── Triggers updated_at ───────────────────────────────────────────────────────
CREATE TRIGGER set_salgados_atualizado_em
  BEFORE UPDATE ON public.salgados
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_salgados_insumos_atualizado_em
  BEFORE UPDATE ON public.salgados_insumos
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_salgados_pedidos_atualizado_em
  BEFORE UPDATE ON public.salgados_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
