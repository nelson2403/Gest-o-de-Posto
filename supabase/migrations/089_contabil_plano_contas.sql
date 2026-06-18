-- ─────────────────────────────────────────────────────────────────────────────
-- 089_contabil_plano_contas.sql
--
-- Armazena o plano de contas do escritório de contabilidade externo,
-- importado via Excel/CSV em Contábil → Exportação de Dados → aba
-- "Mapeamento De/Para". É a fonte das opções da coluna direita do mapeamento
-- (a esquerda é o plano AUTOSYSTEM via tabela `conta`).
--
-- A tabela é independente de contabil_mapeamento_contas — a coluna
-- conta_contabil daquela tabela continua TEXT livre por compatibilidade
-- com mapeamentos já cadastrados, mas a UI passa a oferecer este plano
-- como autocomplete/lista de seleção.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contabil_plano_contas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo        TEXT NOT NULL,
  descricao     TEXT NOT NULL DEFAULT '',
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por    UUID REFERENCES public.usuarios(id)
);

-- UNIQUE em codigo (named constraint) — necessário para o ON CONFLICT
-- do upsert via PostgREST. Dedup case-insensitive é feito no backend
-- antes do INSERT, então não temos duplicatas tipo "1.1.001" / "1.1.001 ".
ALTER TABLE public.contabil_plano_contas
  DROP CONSTRAINT IF EXISTS contabil_plano_contas_codigo_key;
ALTER TABLE public.contabil_plano_contas
  ADD CONSTRAINT contabil_plano_contas_codigo_key UNIQUE (codigo);

-- touch
CREATE OR REPLACE FUNCTION public.touch_contabil_plano_contas()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contabil_plano_contas_touch ON public.contabil_plano_contas;
CREATE TRIGGER contabil_plano_contas_touch
  BEFORE UPDATE ON public.contabil_plano_contas
  FOR EACH ROW EXECUTE FUNCTION public.touch_contabil_plano_contas();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.contabil_plano_contas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contabil_plano_contas_select_authenticated"
  ON public.contabil_plano_contas;
CREATE POLICY "contabil_plano_contas_select_authenticated"
  ON public.contabil_plano_contas FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "contabil_plano_contas_admin_all"
  ON public.contabil_plano_contas;
CREATE POLICY "contabil_plano_contas_admin_all"
  ON public.contabil_plano_contas FOR ALL TO authenticated
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
