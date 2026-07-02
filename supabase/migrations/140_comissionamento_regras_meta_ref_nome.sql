-- ─────────────────────────────────────────────────────────────────────────────
-- 140_comissionamento_regras_meta_ref_nome.sql
--
-- Referência DINÂMICA de meta por nome — resolve o problema de acoplar a
-- regra a uma meta específica (que só existe num mês).
--
-- Antes: regra apontava meta_referencia_id (UUID) → travava a regra no mês
-- daquela meta. Rodar o mesmo esquema em outro mês exigia duplicar regra.
--
-- Agora: regra opcionalmente aponta meta_referencia_nome (texto).
-- O engine resolve, no momento do cálculo:
--   • posto = do cálculo
--   • nome (case-insensitive) = meta_referencia_nome
--   • período da meta cruza o intervalo do cálculo
-- Se achar 1 meta, usa. Se achar mais de 1 (erro de cadastro), usa a que
-- tem maior overlap com o período. Se não achar, atingimento fica null.
--
-- Convivência: meta_referencia_id tem PRIORIDADE. Só cai no nome quando o
-- id é null. Nada quebra pra quem já tem meta específica cadastrada.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.comissio_regras
  ADD COLUMN IF NOT EXISTS meta_referencia_nome VARCHAR(200);

-- Só um dos dois campos preenchido faz sentido, mas não é enforced no BD
-- porque o engine trata a precedência explicitamente (id > nome).
