-- ─────────────────────────────────────────────────────────────────────────────
-- 124_contabil_mapeamento_contas.sql
--
-- Tabela de mapeamento "de/para" entre o plano de contas do AUTOSYSTEM e
-- o plano de contas usado pela contabilidade externa que importa os
-- lançamentos exportados pela página Contábil → Exportação de Dados.
--
-- Cada linha relaciona UMA conta_autosystem → UMA conta_contabil. Quando
-- o CSV é gerado, as colunas conta_debitar / conta_creditar são consultadas
-- contra esta tabela para preencher conta_debitar_contabil / conta_creditar_contabil.
-- Match é exato (sem herança hierárquica) para evitar ambiguidade.
--
-- Mapeamento é global (vale para todas as empresas). Se no futuro for
-- necessário diferenciar por empresa, basta adicionar uma coluna
-- empresa_id e relaxar a UNIQUE.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contabil_mapeamento_contas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_autosystem TEXT NOT NULL,
  conta_contabil   TEXT NOT NULL,
  descricao        TEXT NOT NULL DEFAULT '',
  ativo            BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por       UUID REFERENCES public.usuarios(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_contabil_mapeamento_conta_autosystem
  ON public.contabil_mapeamento_contas (conta_autosystem);

CREATE INDEX IF NOT EXISTS idx_contabil_mapeamento_ativo
  ON public.contabil_mapeamento_contas (ativo)
  WHERE ativo = TRUE;

-- touch atualizado_em
CREATE OR REPLACE FUNCTION public.touch_contabil_mapeamento_contas()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contabil_mapeamento_contas_touch ON public.contabil_mapeamento_contas;
CREATE TRIGGER contabil_mapeamento_contas_touch
  BEFORE UPDATE ON public.contabil_mapeamento_contas
  FOR EACH ROW EXECUTE FUNCTION public.touch_contabil_mapeamento_contas();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.contabil_mapeamento_contas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contabil_mapeamento_contas_select_authenticated"
  ON public.contabil_mapeamento_contas;
CREATE POLICY "contabil_mapeamento_contas_select_authenticated"
  ON public.contabil_mapeamento_contas FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "contabil_mapeamento_contas_admin_all"
  ON public.contabil_mapeamento_contas;
CREATE POLICY "contabil_mapeamento_contas_admin_all"
  ON public.contabil_mapeamento_contas FOR ALL TO authenticated
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
