-- Migration 029: RPC para reatribuir tarefas abertas após troca de postos entre conciliadores
--
-- Chamada automaticamente pelo frontend (/usuarios) sempre que o admin salva
-- os postos de um conciliador, garantindo que tarefas abertas sejam transferidas
-- para o novo conciliador responsável por cada posto.

CREATE OR REPLACE FUNCTION fix_tarefas_apos_troca_posto()
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  -- Para cada tarefa aberta cujo tarefa_recorrente (antigo/inativo) tem um
  -- par ativo com o mesmo posto+categoria mas outro usuario, reatribui.
  UPDATE tarefas t
  SET
    usuario_id           = tr_novo.usuario_id,
    tarefa_recorrente_id = tr_novo.id
  FROM tarefas_recorrentes tr_antigo
  JOIN tarefas_recorrentes tr_novo
    ON  tr_novo.posto_id  = tr_antigo.posto_id
    AND tr_novo.categoria = tr_antigo.categoria
    AND tr_novo.ativo     = true
    AND tr_novo.usuario_id <> tr_antigo.usuario_id
  WHERE t.tarefa_recorrente_id = tr_antigo.id
    AND t.status IN ('pendente', 'em_andamento');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fix_tarefas_apos_troca_posto() TO authenticated;

-- Executa imediatamente para corrigir as tarefas da troca já realizada
SELECT fix_tarefas_apos_troca_posto();
