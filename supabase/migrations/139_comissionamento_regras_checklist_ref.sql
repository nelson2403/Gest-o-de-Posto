-- ─────────────────────────────────────────────────────────────────────────────
-- 139_comissionamento_regras_checklist_ref.sql
--
-- Adiciona referência de template de checklist na regra. Análoga ao
-- meta_referencia_id, mas específica para condições do campo
-- `pontuacao_checklist`.
--
-- Uso: quando a regra tem uma condição como
--   "pontuacao_checklist >= 80"
-- o engine precisa saber DE QUAL template do checklist os pontos vêm
-- (uma empresa pode ter vários templates ativos ao mesmo tempo). Sem
-- essa FK a condição seria ambígua e sempre bateria em zero.
--
-- Efeito no engine: quando o campo é preenchido, o engine soma
-- total_pontos das aplicações desse template cujo período cruza o
-- período do cálculo e coloca no contexto como pontuacao_checklist.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.comissio_regras
  ADD COLUMN IF NOT EXISTS checklist_template_referencia_id UUID
    REFERENCES public.comissio_checklists_template(id) ON DELETE SET NULL;
