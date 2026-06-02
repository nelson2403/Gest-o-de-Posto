-- Mapeia cada forma de pagamento (conta.nome do AUTOSYSTEM) ao grupo do fechamento de caixa
-- Ex: "PROFROTAS" → frotas, "PIX - STONE" → pix, "STONE - VISA CREDITO" → cartoes
CREATE TABLE IF NOT EXISTS public.frentista_tef_grupo (
  operadora_chave TEXT         PRIMARY KEY,
  grupo           TEXT,
  atualizado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_por  UUID         REFERENCES auth.users(id)
);

-- Atualiza o CHECK para incluir todos os grupos suportados
ALTER TABLE public.frentista_tef_grupo
  DROP CONSTRAINT IF EXISTS frentista_tef_grupo_grupo_check;

ALTER TABLE public.frentista_tef_grupo
  ADD CONSTRAINT frentista_tef_grupo_grupo_check
  CHECK (grupo IN ('dinheiro', 'cartoes', 'pix', 'pix_cnpj', 'frotas', 'a_prazo', 'cheque', 'notas_promissorias'));

ALTER TABLE public.frentista_tef_grupo ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "frentista_tef_grupo_select" ON public.frentista_tef_grupo
    FOR SELECT USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "frentista_tef_grupo_write" ON public.frentista_tef_grupo
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.usuarios
        WHERE id = auth.uid() AND role IN ('master', 'adm_financeiro')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
