-- =====================================================================
-- 018_relatorio_conciliacao.sql
-- Função SQL para retornar o demonstrativo de conciliação bancária
-- com a tarefa MAIS RECENTE por posto (LATERAL JOIN garante isso
-- no banco, eliminando problemas de ordenação no lado do cliente).
-- Execute no Supabase SQL Editor
-- =====================================================================

CREATE OR REPLACE FUNCTION get_conciliacao_por_posto()
RETURNS TABLE(
  posto_id                UUID,
  posto_nome              TEXT,
  status_tarefa           TEXT,
  data_inicio             DATE,
  data_conclusao_prevista DATE,
  data_conclusao_real     TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER  -- respeita o RLS de cada usuário chamante
AS $$
  SELECT
    p.id                          AS posto_id,
    p.nome::TEXT                  AS posto_nome,
    t.status::TEXT                AS status_tarefa,
    t.data_inicio,
    t.data_conclusao_prevista,
    t.data_conclusao_real
  FROM postos p
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
  WHERE p.ativo = TRUE
  ORDER BY p.nome;
$$;

GRANT EXECUTE ON FUNCTION get_conciliacao_por_posto() TO authenticated;
