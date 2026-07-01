-- ─────────────────────────────────────────────────────────────────────────────
-- 134_comissionamento_checklists.sql
--
-- Checklist mensal aplicado pelo supervisor: base para pagamento de
-- comissão em regras que dependem de avaliação qualitativa (limpeza,
-- uniforme, documentação, etc.).
--
-- Domínio:
--   • template  → modelo de checklist com itens e pontuação (soma = 100
--                 tipicamente, mas não é enforced — o valor_meta da
--                 Meta é quem define o alvo pra atingimento)
--   • item      → linha do template com descricao e pontos
--   • aplicacao → preenchimento mensal (posto × template × período).
--                 UNIQUE (template, posto, period_start, period_end)
--                 evita duplicação silenciosa.
--   • resposta  → S/N + motivo por item da aplicação. total_pontos da
--                 aplicação = Σ(pontos dos itens marcados S), mantido
--                 sincronizado por trigger.
--
-- Integração com metas: nova FK em comissio_metas.checklist_template_id
-- e 'checklist' entra no CHECK de campo. Uma meta desse tipo tem
-- valor_meta = pontuação alvo (ex.: 80). Engine resolve o atingimento
-- pegando a aplicação do posto que cruza o período e usando total_pontos
-- como realizado.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Templates ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comissio_checklists_template (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          TEXT NOT NULL,
  descricao     TEXT NOT NULL DEFAULT '',
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por    UUID REFERENCES public.usuarios(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_comissio_checklists_template_nome
  ON public.comissio_checklists_template (lower(nome));

CREATE OR REPLACE FUNCTION public.touch_comissio_checklists_template()
RETURNS TRIGGER AS $$
BEGIN NEW.atualizado_em := NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS comissio_checklists_template_touch ON public.comissio_checklists_template;
CREATE TRIGGER comissio_checklists_template_touch
  BEFORE UPDATE ON public.comissio_checklists_template
  FOR EACH ROW EXECUTE FUNCTION public.touch_comissio_checklists_template();

-- ── Itens do template ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comissio_checklists_itens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID NOT NULL REFERENCES public.comissio_checklists_template(id) ON DELETE CASCADE,
  ordem         INTEGER NOT NULL DEFAULT 0,
  descricao     TEXT NOT NULL,
  pontos        NUMERIC NOT NULL CHECK (pontos > 0),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comissio_checklists_itens_template
  ON public.comissio_checklists_itens(template_id, ordem);

-- ── Aplicação mensal ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comissio_checklists_aplicacoes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    UUID NOT NULL REFERENCES public.comissio_checklists_template(id) ON DELETE RESTRICT,
  posto_id       UUID NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  period_start   DATE NOT NULL,
  period_end     DATE NOT NULL,
  total_pontos   NUMERIC NOT NULL DEFAULT 0,
  observacoes    TEXT NOT NULL DEFAULT '',
  supervisor_user_id UUID REFERENCES public.usuarios(id),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por     UUID REFERENCES public.usuarios(id),
  CHECK (period_end >= period_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_comissio_checklists_aplicacoes
  ON public.comissio_checklists_aplicacoes (template_id, posto_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_comissio_checklists_aplicacoes_posto
  ON public.comissio_checklists_aplicacoes(posto_id, period_start);

CREATE OR REPLACE FUNCTION public.touch_comissio_checklists_aplicacoes()
RETURNS TRIGGER AS $$
BEGIN NEW.atualizado_em := NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS comissio_checklists_aplicacoes_touch ON public.comissio_checklists_aplicacoes;
CREATE TRIGGER comissio_checklists_aplicacoes_touch
  BEFORE UPDATE ON public.comissio_checklists_aplicacoes
  FOR EACH ROW EXECUTE FUNCTION public.touch_comissio_checklists_aplicacoes();

-- ── Respostas por item ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comissio_checklists_respostas (
  aplicacao_id  UUID NOT NULL REFERENCES public.comissio_checklists_aplicacoes(id) ON DELETE CASCADE,
  item_id       UUID NOT NULL REFERENCES public.comissio_checklists_itens(id)      ON DELETE CASCADE,
  ok            BOOLEAN NOT NULL DEFAULT FALSE,
  motivo        TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (aplicacao_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_comissio_checklists_respostas_aplic
  ON public.comissio_checklists_respostas(aplicacao_id);

-- ── Trigger: recalcula total_pontos da aplicação quando resposta muda ──────
-- Soma os pontos dos itens marcados ok=true. O recalculo roda no BD
-- para nunca ficar dessincronizado com o cliente (fonte da verdade).
CREATE OR REPLACE FUNCTION public.recalc_comissio_checklist_total()
RETURNS TRIGGER AS $$
DECLARE
  v_aplic UUID;
  v_total NUMERIC;
BEGIN
  v_aplic := COALESCE(NEW.aplicacao_id, OLD.aplicacao_id);
  SELECT COALESCE(SUM(i.pontos), 0) INTO v_total
    FROM public.comissio_checklists_respostas r
    JOIN public.comissio_checklists_itens     i ON i.id = r.item_id
   WHERE r.aplicacao_id = v_aplic AND r.ok = TRUE;
  UPDATE public.comissio_checklists_aplicacoes
     SET total_pontos = v_total
   WHERE id = v_aplic;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS comissio_checklist_respostas_recalc_ins ON public.comissio_checklists_respostas;
CREATE TRIGGER comissio_checklist_respostas_recalc_ins
  AFTER INSERT ON public.comissio_checklists_respostas
  FOR EACH ROW EXECUTE FUNCTION public.recalc_comissio_checklist_total();

DROP TRIGGER IF EXISTS comissio_checklist_respostas_recalc_upd ON public.comissio_checklists_respostas;
CREATE TRIGGER comissio_checklist_respostas_recalc_upd
  AFTER UPDATE ON public.comissio_checklists_respostas
  FOR EACH ROW EXECUTE FUNCTION public.recalc_comissio_checklist_total();

DROP TRIGGER IF EXISTS comissio_checklist_respostas_recalc_del ON public.comissio_checklists_respostas;
CREATE TRIGGER comissio_checklist_respostas_recalc_del
  AFTER DELETE ON public.comissio_checklists_respostas
  FOR EACH ROW EXECUTE FUNCTION public.recalc_comissio_checklist_total();

-- ── FK e CHECK em comissio_metas para o campo 'checklist' ──────────────────
ALTER TABLE public.comissio_metas
  ADD COLUMN IF NOT EXISTS checklist_template_id UUID
    REFERENCES public.comissio_checklists_template(id) ON DELETE SET NULL;

ALTER TABLE public.comissio_metas
  DROP CONSTRAINT IF EXISTS comissio_metas_campo_check;

ALTER TABLE public.comissio_metas
  ADD CONSTRAINT comissio_metas_campo_check
    CHECK (campo IN ('faturamento', 'quantidade', 'margem', 'mix', 'markup', 'checklist'));

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.comissio_checklists_template   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissio_checklists_itens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissio_checklists_aplicacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissio_checklists_respostas  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'comissio_checklists_template',
    'comissio_checklists_itens',
    'comissio_checklists_aplicacoes',
    'comissio_checklists_respostas'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_select_authenticated" ON public.%s', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_select_authenticated" ON public.%s FOR SELECT TO authenticated USING (TRUE)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_admin_all" ON public.%s', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_admin_all" ON public.%s FOR ALL TO authenticated ' ||
      'USING ( EXISTS (SELECT 1 FROM public.usuarios WHERE id = auth.uid() ' ||
      '                AND role IN (''master'',''adm_financeiro'',''rh'')) ) ' ||
      'WITH CHECK ( EXISTS (SELECT 1 FROM public.usuarios WHERE id = auth.uid() ' ||
      '                    AND role IN (''master'',''adm_financeiro'',''rh'')) )', t, t);
  END LOOP;
END $$;
