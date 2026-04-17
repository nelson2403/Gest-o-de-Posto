-- Adiciona empresa_id em acessos_unificados
-- para identificar a qual empresa pertence o acesso
ALTER TABLE acessos_unificados
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_acessos_unif_empresa ON public.acessos_unificados(empresa_id);
