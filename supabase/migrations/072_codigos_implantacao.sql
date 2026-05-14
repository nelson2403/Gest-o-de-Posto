-- Tabela: códigos de implantação por adquirente + posto
CREATE TABLE public.adquirentes_implantacao (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id    UUID        NOT NULL REFERENCES public.empresas(id)    ON DELETE CASCADE,
  adquirente_id UUID        NOT NULL REFERENCES public.adquirentes(id) ON DELETE CASCADE,
  posto_id      UUID        NOT NULL REFERENCES public.postos(id)      ON DELETE CASCADE,
  codigo        TEXT        NOT NULL,
  observacoes   TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (adquirente_id, posto_id)
);

ALTER TABLE public.adquirentes_implantacao ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_updated_at_adquirentes_implantacao
  BEFORE UPDATE ON public.adquirentes_implantacao
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Leitura: qualquer usuário da mesma empresa
CREATE POLICY "implantacao_select" ON public.adquirentes_implantacao
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM public.usuarios WHERE id = auth.uid())
  );

-- Gerência: somente master e adm_financeiro
CREATE POLICY "implantacao_manage" ON public.adquirentes_implantacao
  FOR ALL USING (
    (SELECT role FROM public.usuarios WHERE id = auth.uid()) IN ('master', 'adm_financeiro')
  ) WITH CHECK (
    (SELECT role FROM public.usuarios WHERE id = auth.uid()) IN ('master', 'adm_financeiro')
  );
