-- =====================================================================
-- 021_ultima_conclusao_posto.sql
-- Adiciona o campo ultima_conclusao à função get_conciliacao_por_posto:
-- mostra a data da última tarefa CONCLUÍDA do posto, independente
-- do status da tarefa mais recente.
-- Execute no Supabase SQL Editor
-- =====================================================================

DROP FUNCTION IF EXISTS get_conciliacao_por_posto();

CREATE OR REPLACE FUNCTION get_conciliacao_por_posto()
RETURNS TABLE(
  posto_id                UUID,
  posto_nome              TEXT,
  status_tarefa           TEXT,
  data_inicio             DATE,
  data_conclusao_prevista DATE,
  data_conclusao_real     TIMESTAMPTZ,
  ultima_conclusao        DATE
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    p.id                          AS posto_id,
    p.nome::TEXT                  AS posto_nome,
    t.status::TEXT                AS status_tarefa,
    t.data_inicio,
    t.data_conclusao_prevista,
    t.data_conclusao_real,
    uc.ultima_conclusao
  FROM postos p
  -- Tarefa mais recente do posto (qualquer status)
  LEFT JOIN LATERAL (
    SELECT
      t2.status,
      t2.data_inicio,
      t2.data_conclusao_prevista,
      t2.data_conclusao_real
    FROM tarefas t2
    INNER JOIN tarefas_recorrentes tr
      ON t2.tarefa_recorrente_id = tr.id
    WHERE tr.posto_id = p.id
      AND t2.categoria = 'conciliacao_bancaria'
      AND t2.tarefa_recorrente_id IS NOT NULL
    ORDER BY t2.data_inicio DESC
    LIMIT 1
  ) t ON TRUE
  -- Última tarefa CONCLUÍDA do posto (para exibir na coluna Concluído)
  LEFT JOIN LATERAL (
    SELECT MAX(t3.data_inicio) AS ultima_conclusao
    FROM tarefas t3
    INNER JOIN tarefas_recorrentes tr3
      ON t3.tarefa_recorrente_id = tr3.id
    WHERE tr3.posto_id = p.id
      AND t3.categoria = 'conciliacao_bancaria'
      AND t3.status = 'concluido'
  ) uc ON TRUE
  WHERE p.ativo = TRUE
  ORDER BY p.nome;
$$;

GRANT EXECUTE ON FUNCTION get_conciliacao_por_posto() TO authenticated;
