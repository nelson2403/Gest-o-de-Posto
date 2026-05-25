-- ─────────────────────────────────────────────────────────────────────────────
-- 079_comissionamento_regras_tipos.sql
--
-- Atualiza os valores válidos de `comissio_regras.resultado_tipo`.
--
-- Antes: percentual / valor_fixo / por_unidade
-- Agora: vendas_rs / quantidade / mix / produto / grupo_produto / subgrupo_produto
--
-- Mapeamento dos valores antigos eventualmente já gravados (compatibilidade):
--   • percentual   → vendas_rs   (percentual padrão = % sobre faturamento)
--   • valor_fixo   → vendas_rs   (valor fixo passa a representar uma comissão
--                                 sobre vendas em R$; visualmente o valor segue
--                                 igual, é só a categorização que muda)
--   • por_unidade  → quantidade
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Remove o constraint atual pra permitir reescrever os dados.
ALTER TABLE public.comissio_regras
  DROP CONSTRAINT IF EXISTS comissio_regras_resultado_tipo_check;

-- 2) Reescreve registros legados.
UPDATE public.comissio_regras
   SET resultado_tipo = CASE resultado_tipo
                          WHEN 'percentual'  THEN 'vendas_rs'
                          WHEN 'valor_fixo'  THEN 'vendas_rs'
                          WHEN 'por_unidade' THEN 'quantidade'
                          ELSE resultado_tipo
                        END
 WHERE resultado_tipo IN ('percentual','valor_fixo','por_unidade');

-- 3) Garante DEFAULT compatível com o novo enum.
ALTER TABLE public.comissio_regras
  ALTER COLUMN resultado_tipo SET DEFAULT 'vendas_rs';

-- 4) Adiciona o novo CHECK constraint.
ALTER TABLE public.comissio_regras
  ADD CONSTRAINT comissio_regras_resultado_tipo_check
  CHECK (resultado_tipo IN (
    'vendas_rs',
    'quantidade',
    'mix',
    'produto',
    'grupo_produto',
    'subgrupo_produto'
  ));
