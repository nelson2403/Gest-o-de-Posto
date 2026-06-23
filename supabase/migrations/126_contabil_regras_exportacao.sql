-- ─────────────────────────────────────────────────────────────────────────────
-- 126_contabil_regras_exportacao.sql
--
-- Regras de transformação aplicadas durante a exportação do CSV em
-- Contábil → Exportação de Dados.
--
-- Cada regra expressa "SE <campo> <operador> <valor> ENTÃO <campo_destino> = <novo_valor>".
-- Avaliadas em ordem crescente (campo `ordem`), as ativas são aplicadas
-- depois do mapeamento de/para padrão. Permite cobrir casos como
-- "se a conta a débito começa com 2.1.1, usar a conta de provisão em vez
-- da conta de pagamento" — a regra simplesmente sobrescreve o campo final.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contabil_regras_exportacao (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome              TEXT NOT NULL,
  descricao         TEXT NOT NULL DEFAULT '',
  ativa             BOOLEAN NOT NULL DEFAULT TRUE,
  ordem             INTEGER NOT NULL DEFAULT 0,

  -- Condição
  condicao_campo    TEXT NOT NULL
    CHECK (condicao_campo IN ('conta_debitar','conta_creditar','observacao','documento','pessoa')),
  condicao_operador TEXT NOT NULL
    CHECK (condicao_operador IN ('starts_with','not_starts_with','equals','not_equals','contains','not_contains')),
  condicao_valor    TEXT NOT NULL,

  -- Ação (substitui o valor final de saída de um campo)
  acao_campo        TEXT NOT NULL
    CHECK (acao_campo IN ('conta_debitar','conta_creditar','observacao')),
  acao_valor        TEXT NOT NULL,

  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por        UUID REFERENCES public.usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_contabil_regras_ativa
  ON public.contabil_regras_exportacao (ordem)
  WHERE ativa = TRUE;

-- touch
CREATE OR REPLACE FUNCTION public.touch_contabil_regras_exportacao()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contabil_regras_exportacao_touch ON public.contabil_regras_exportacao;
CREATE TRIGGER contabil_regras_exportacao_touch
  BEFORE UPDATE ON public.contabil_regras_exportacao
  FOR EACH ROW EXECUTE FUNCTION public.touch_contabil_regras_exportacao();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.contabil_regras_exportacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contabil_regras_exportacao_select_authenticated"
  ON public.contabil_regras_exportacao;
CREATE POLICY "contabil_regras_exportacao_select_authenticated"
  ON public.contabil_regras_exportacao FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "contabil_regras_exportacao_admin_all"
  ON public.contabil_regras_exportacao;
CREATE POLICY "contabil_regras_exportacao_admin_all"
  ON public.contabil_regras_exportacao FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid() AND role IN ('master','adm_financeiro')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid() AND role IN ('master','adm_financeiro')
    )
  );
