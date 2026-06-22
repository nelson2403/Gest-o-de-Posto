-- =====================================================================
-- 122_patrocinio_enviado_contas_pagar.sql
-- Patrocínio: novo status "enviado" (quando os documentos são enviados
-- para o Contas a Pagar) + vínculo com a solicitação de pagamento gerada.
-- O valor continua contando no saldo (aprovado OU enviado = compromisso firmado).
-- =====================================================================

-- 1. Aceita o status 'enviado'
ALTER TABLE marketing_patrocinios DROP CONSTRAINT IF EXISTS marketing_patrocinios_status_check;
ALTER TABLE marketing_patrocinios
  ADD CONSTRAINT marketing_patrocinios_status_check
  CHECK (status IN ('pendente','aprovado','enviado','reprovado'));

-- 2. Vínculo / auditoria do envio ao Contas a Pagar
ALTER TABLE marketing_patrocinios
  ADD COLUMN IF NOT EXISTS enviado_contas_pagar_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS solicitacao_pagamento_id UUID REFERENCES solicitacoes_pagamento(id) ON DELETE SET NULL;

-- 3. Saldo: 'enviado' também conta como gasto (já foi aprovado antes)
CREATE OR REPLACE VIEW vw_marketing_saldo AS
SELECT
  p.id                                        AS posto_id,
  p.nome                                      AS posto_nome,
  EXTRACT(YEAR  FROM CURRENT_DATE)::int       AS ano,
  EXTRACT(MONTH FROM CURRENT_DATE)::int       AS mes,
  COALESCE(l.limite_mensal_patrocinio, 200.00)  AS limite_mensal,
  COALESCE(l.limite_anual_patrocinio,  2400.00) AS limite_anual,
  COALESCE((
    SELECT SUM(valor) FROM marketing_patrocinios
    WHERE posto_id = p.id AND status IN ('aprovado','enviado')
      AND EXTRACT(YEAR  FROM data_evento) = EXTRACT(YEAR  FROM CURRENT_DATE)
      AND EXTRACT(MONTH FROM data_evento) = EXTRACT(MONTH FROM CURRENT_DATE)
  ), 0) AS gasto_mensal_patrocinio,
  COALESCE((
    SELECT SUM(valor) FROM marketing_patrocinios
    WHERE posto_id = p.id AND status IN ('aprovado','enviado')
      AND EXTRACT(YEAR FROM data_evento) = EXTRACT(YEAR FROM CURRENT_DATE)
  ), 0) AS gasto_anual_patrocinio,
  COALESCE((
    SELECT SUM(COALESCE(ap.valor, a.valor_padrao))
    FROM marketing_acao_postos ap
    JOIN marketing_acoes a ON a.id = ap.acao_id
    WHERE ap.posto_id = p.id AND ap.status = 'aprovado'
      AND EXTRACT(YEAR  FROM a.data_acao) = EXTRACT(YEAR  FROM CURRENT_DATE)
      AND EXTRACT(MONTH FROM a.data_acao) = EXTRACT(MONTH FROM CURRENT_DATE)
  ), 0) AS gasto_mensal_acoes
FROM postos p
LEFT JOIN marketing_limites l
  ON l.posto_id = p.id
  AND l.ano = EXTRACT(YEAR FROM CURRENT_DATE)::int;

NOTIFY pgrst, 'reload schema';
