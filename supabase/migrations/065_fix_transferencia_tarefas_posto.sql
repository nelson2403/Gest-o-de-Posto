-- ─────────────────────────────────────────────────────────────────────────────
-- 065: Melhora transferência de tarefas em atraso na troca de posto (conciliador)
--
-- Problema original: fix_tarefas_apos_troca_posto() tentava atualizar
-- tarefa_recorrente_id, mas quando o novo conciliador já tinha uma tarefa
-- gerada para a mesma data (após a troca), isso violava UNIQUE(tarefa_recorrente_id, data_inicio).
--
-- Solução: transferir apenas usuario_id (propriedade), sem mexer em
-- tarefa_recorrente_id. Também cobre tarefas com posto_id direto.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fix_tarefas_apos_troca_posto()
RETURNS INT AS $$
DECLARE
  v_count   INT := 0;
  v_partial INT;
BEGIN

  -- ── Estratégia 1: via tarefa_recorrente_id ────────────────────────────────
  -- Tarefa vinculada a um recorrente inativo → atribui ao novo conciliador
  -- ativo no mesmo posto. Não altera tarefa_recorrente_id para evitar conflito
  -- de chave única (tarefa_recorrente_id, data_inicio).
  UPDATE tarefas t
  SET usuario_id = tr_novo.usuario_id
  FROM tarefas_recorrentes tr_antigo
  JOIN tarefas_recorrentes tr_novo
    ON  tr_novo.posto_id   = tr_antigo.posto_id
    AND tr_novo.ativo      = true
    AND tr_novo.usuario_id <> tr_antigo.usuario_id
  WHERE t.tarefa_recorrente_id = tr_antigo.id
    AND t.status               IN ('pendente', 'em_andamento')
    AND t.usuario_id           <> tr_novo.usuario_id;  -- evita no-op

  GET DIAGNOSTICS v_partial = ROW_COUNT;
  v_count := v_count + v_partial;

  -- ── Estratégia 2: via posto_id direto ─────────────────────────────────────
  -- Tarefa tem posto_id mas o responsável atual NÃO tem mais recorrente ativo
  -- para esse posto → transfere para quem tem.
  UPDATE tarefas t
  SET usuario_id = (
    SELECT tr_ativo.usuario_id
    FROM   tarefas_recorrentes tr_ativo
    WHERE  tr_ativo.posto_id = t.posto_id
      AND  tr_ativo.ativo    = true
    LIMIT 1
  )
  WHERE t.status   IN ('pendente', 'em_andamento')
    AND t.posto_id IS NOT NULL
    -- responsável atual NÃO tem recorrente ativo para esse posto
    AND NOT EXISTS (
      SELECT 1 FROM tarefas_recorrentes tr
      WHERE  tr.usuario_id = t.usuario_id
        AND  tr.posto_id   = t.posto_id
        AND  tr.ativo      = true
    )
    -- mas existe outro usuário com recorrente ativo para esse posto
    AND EXISTS (
      SELECT 1 FROM tarefas_recorrentes tr
      WHERE  tr.posto_id   = t.posto_id
        AND  tr.ativo      = true
        AND  tr.usuario_id <> t.usuario_id
    );

  GET DIAGNOSTICS v_partial = ROW_COUNT;
  v_count := v_count + v_partial;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.fix_tarefas_apos_troca_posto() TO authenticated;

-- Executa imediatamente para corrigir a troca que já aconteceu
SELECT public.fix_tarefas_apos_troca_posto();
