-- ─────────────────────────────────────────────────────────────────────────────
-- 031: Formas de Pagamento por Adquirente + Melhorias nas Taxas
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Tabela de formas de pagamento por adquirente
CREATE TABLE IF NOT EXISTS public.adquirente_formas_pagamento (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adquirente_id UUID NOT NULL REFERENCES public.adquirentes(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  ativo         BOOLEAN NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (adquirente_id, nome)
);

-- Trigger atualiza atualizado_em
CREATE OR REPLACE FUNCTION public.set_atualizado_em()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.atualizado_em = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_adquirente_formas_pagamento_atualizado
  BEFORE UPDATE ON public.adquirente_formas_pagamento
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();

-- RLS
ALTER TABLE public.adquirente_formas_pagamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "master_admin_full_formas_pagamento" ON public.adquirente_formas_pagamento
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.role IN ('master','admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Altera tabela taxas
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove unique constraint antiga
ALTER TABLE public.taxas DROP CONSTRAINT IF EXISTS taxas_posto_id_adquirente_id_key;

-- Torna posto_id nullable (para abrangência "todos" ou "multiplos")
ALTER TABLE public.taxas ALTER COLUMN posto_id DROP NOT NULL;

-- Adiciona referência à forma de pagamento
ALTER TABLE public.taxas
  ADD COLUMN IF NOT EXISTS forma_pagamento_id UUID REFERENCES public.adquirente_formas_pagamento(id) ON DELETE SET NULL;

-- Adiciona campo de abrangência
ALTER TABLE public.taxas
  ADD COLUMN IF NOT EXISTS abrangencia TEXT NOT NULL DEFAULT 'posto_especifico'
    CHECK (abrangencia IN ('posto_especifico', 'todos_postos', 'multiplos_postos'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tabela de postos para taxas com multipla abrangência
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.taxa_postos (
  taxa_id  UUID NOT NULL REFERENCES public.taxas(id) ON DELETE CASCADE,
  posto_id UUID NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  PRIMARY KEY (taxa_id, posto_id)
);

ALTER TABLE public.taxa_postos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "master_admin_full_taxa_postos" ON public.taxa_postos
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.role IN ('master','admin')
    )
  );
