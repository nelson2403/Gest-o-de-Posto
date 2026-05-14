-- ─── Catálogo de produtos de uso e consumo ──────────────────────────────────
CREATE TABLE public.uc_produtos (
  id               UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id       UUID         NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome             TEXT         NOT NULL,
  categoria        TEXT,
  unidade          TEXT         NOT NULL DEFAULT 'un',
  preco_unitario   NUMERIC(10,2),
  estoque_minimo   NUMERIC(10,3) NOT NULL DEFAULT 0,
  ativo            BOOLEAN      NOT NULL DEFAULT true,
  criado_em        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE public.uc_produtos ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_updated_at_uc_produtos
  BEFORE UPDATE ON public.uc_produtos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "uc_produtos_select" ON public.uc_produtos
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM public.usuarios WHERE id = auth.uid())
  );

CREATE POLICY "uc_produtos_manage" ON public.uc_produtos
  FOR ALL USING (
    (SELECT role FROM public.usuarios WHERE id = auth.uid()) IN ('master', 'adm_financeiro')
  ) WITH CHECK (
    (SELECT role FROM public.usuarios WHERE id = auth.uid()) IN ('master', 'adm_financeiro')
  );

-- ─── Movimentos (entradas, transferências p/ postos, saídas) ─────────────────
CREATE TABLE public.uc_movimentos (
  id               UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id       UUID         NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  produto_id       UUID         NOT NULL REFERENCES public.uc_produtos(id) ON DELETE RESTRICT,
  tipo             TEXT         NOT NULL CHECK (tipo IN ('entrada', 'transferencia', 'saida')),
  quantidade       NUMERIC(10,3) NOT NULL CHECK (quantidade > 0),
  valor_unitario   NUMERIC(10,2),
  posto_id         UUID         REFERENCES public.postos(id) ON DELETE SET NULL,
  observacoes      TEXT,
  usuario_id       UUID         REFERENCES public.usuarios(id) ON DELETE SET NULL,
  data             DATE         NOT NULL DEFAULT CURRENT_DATE,
  criado_em        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE public.uc_movimentos ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_uc_movimentos_produto ON public.uc_movimentos(produto_id);
CREATE INDEX idx_uc_movimentos_data    ON public.uc_movimentos(data);

CREATE POLICY "uc_movimentos_select" ON public.uc_movimentos
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM public.usuarios WHERE id = auth.uid())
  );

CREATE POLICY "uc_movimentos_insert" ON public.uc_movimentos
  FOR INSERT WITH CHECK (
    (SELECT role FROM public.usuarios WHERE id = auth.uid()) IN ('master', 'adm_financeiro')
  );

CREATE POLICY "uc_movimentos_delete" ON public.uc_movimentos
  FOR DELETE USING (
    (SELECT role FROM public.usuarios WHERE id = auth.uid()) IN ('master', 'adm_financeiro')
  );
