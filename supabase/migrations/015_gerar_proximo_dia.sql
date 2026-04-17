-- =====================================================================
-- 015_gerar_proximo_dia.sql
-- Função para conciliador gerar tarefas do próximo dia manualmente
-- Execute no Supabase SQL Editor
-- =====================================================================

CREATE OR REPLACE FUNCTION gerar_tarefas_proximo_dia()
RETURNS INT AS $$
DECLARE
  rec        tarefas_recorrentes%ROWTYPE;
  dt_ultimo  DATE;
  dt_proximo DATE;
  dt_prazo   DATE;
  v_count    INT := 0;
BEGIN
  FOR rec IN
    SELECT * FROM tarefas_recorrentes WHERE ativo = true
  LOOP
    -- Busca a data mais recente já gerada para este recorrente
    SELECT MAX(data_inicio) INTO dt_ultimo
    FROM tarefas
    WHERE tarefa_recorrente_id = rec.id
      AND gerado_automaticamente = true;

    -- Se não existe nenhuma ainda, usa a data automática padrão
    IF dt_ultimo IS NULL THEN
      dt_ultimo := CURRENT_DATE - rec.carencia_dias;
    END IF;

    dt_proximo := dt_ultimo + 1;
    dt_prazo   := dt_proximo + rec.tolerancia_dias;

    -- Não gera datas futuras (além de hoje)
    IF dt_proximo > CURRENT_DATE THEN
      CONTINUE;
    END IF;

    -- Só insere se ainda não existe para essa data
    IF NOT EXISTS (
      SELECT 1 FROM tarefas
      WHERE tarefa_recorrente_id = rec.id
        AND data_inicio = dt_proximo
    ) THEN
      INSERT INTO tarefas (
        empresa_id, usuario_id, titulo, descricao,
        status, prioridade, categoria,
        data_inicio, data_conclusao_prevista,
        tarefa_recorrente_id, gerado_automaticamente
      ) VALUES (
        rec.empresa_id, rec.usuario_id, rec.titulo, rec.descricao,
        'em_andamento', rec.prioridade, rec.categoria,
        dt_proximo, dt_prazo,
        rec.id, true
      )
      ON CONFLICT DO NOTHING;

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION gerar_tarefas_proximo_dia() TO authenticated;
