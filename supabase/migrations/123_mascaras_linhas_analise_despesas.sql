-- ─────────────────────────────────────────────────────────────────────────────
-- 123_mascaras_linhas_analise_despesas.sql
--
-- Marca quais linhas da máscara DRE (tipo_linha = 'grupo') devem aparecer
-- na seção "Análise de Despesas" do relatório gerencial em Contábil →
-- Relatórios. Ao marcar a flag, todas as contas/sub-grupos vinculados à
-- linha (via comissio... err, via mascaras_mapeamentos e
-- mascaras_mapeamentos_grupos) entram na análise expandida.
--
-- Default FALSE para manter o comportamento atual de todas as linhas
-- existentes (precisam ser marcadas explicitamente).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.mascaras_linhas
  ADD COLUMN IF NOT EXISTS usar_em_analise_despesas BOOLEAN NOT NULL DEFAULT FALSE;

-- Index parcial — só linhas marcadas são consultadas pelo relatório
CREATE INDEX IF NOT EXISTS idx_mascaras_linhas_analise_despesas
  ON public.mascaras_linhas (mascara_id)
  WHERE usar_em_analise_despesas = TRUE;
