-- Migration 093: Configuração de grupos por motivo para fechamento de caixa frentista
-- Mapeia cada motivo do AUTOSYSTEM a um grupo de pagamento (cartoes, pix, frotas, dinheiro, a_prazo)

CREATE TABLE IF NOT EXISTS public.frentista_motivo_grupo (
  motivo_grid   BIGINT       PRIMARY KEY,   -- motivo_movto.grid no AUTOSYSTEM
  grupo         TEXT         CHECK (grupo IN ('dinheiro', 'cartoes', 'pix', 'frotas', 'a_prazo')),
  motivo_nome   TEXT,                       -- cache do nome para exibição
  atualizado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_por UUID        REFERENCES auth.users(id)
);

ALTER TABLE public.frentista_motivo_grupo ENABLE ROW LEVEL SECURITY;

-- Leitura para qualquer autenticado
CREATE POLICY "frentista_motivo_grupo_select"
  ON public.frentista_motivo_grupo FOR SELECT TO authenticated
  USING (true);

-- Escrita para master e adm_financeiro
CREATE POLICY "frentista_motivo_grupo_modify"
  ON public.frentista_motivo_grupo FOR ALL TO authenticated
  USING (get_user_role() IN ('master', 'adm_financeiro'))
  WITH CHECK (get_user_role() IN ('master', 'adm_financeiro'));
