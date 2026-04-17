-- =====================================================================
-- 047_fix_geracao_tarefas.sql
-- Corrige dois bugs introduzidos em 037:
--
-- Bug 1: gerar_tarefas_conciliacao() usava CURRENT_DATE - carencia_dias
--   como limite. Se carencia_dias=3 e hoje=16/04, o limite fica 13/04
--   que é domingo+feriado ES → recua para 11/04, nunca gerando 14/04
--   e 15/04. Correção: limite fixo = ontem (último dia útil bancário).
--
-- Bug 2: INSERT em gerar_tarefas_conciliacao() não incluía posto_id,
--   causando posto_id=NULL nas tarefas geradas e quebrando filtros.
--
-- Ambas as funções passam a usar is_dia_util_bancario (037).
-- =====================================================================

CREATE OR REPLACE FUNCTION gerar_tarefas_conciliacao()
RETURNS INT AS $$
DECLARE
  rec         tarefas_recorrentes%ROWTYPE;
  dt_limite   DATE;
  dt_cursor   DATE;
  dt_primeiro DATE;
  v_count     INT := 0;
BEGIN
  FOR rec IN
    SELECT * FROM tarefas_recorrentes
    WHERE ativo = true
      AND usuario_id = auth.uid()
  LOOP
    -- Limite = ontem, recuando até o último dia útil bancário
    dt_limite := CURRENT_DATE - 1;
    WHILE NOT is_dia_util_bancario(dt_limite) LOOP
      dt_limite := dt_limite - 1;
    END LOOP;

    -- Ponto de partida: primeiro dia já existente (cap 60 dias)
    SELECT MIN(data_inicio) INTO dt_primeiro
    FROM tarefas
    WHERE tarefa_recorrente_id = rec.id;

    IF dt_primeiro IS NULL THEN
      dt_cursor := dt_limite;
    ELSE
      dt_cursor := GREATEST(dt_primeiro, dt_limite - 60);
    END IF;

    -- Varre todos os dias úteis bancários até o limite
    LOOP
      WHILE NOT is_dia_util_bancario(dt_cursor) LOOP
        dt_cursor := dt_cursor + 1;
      END LOOP;

      EXIT WHEN dt_cursor > dt_limite;

      IF NOT EXISTS (
        SELECT 1 FROM tarefas
        WHERE tarefa_recorrente_id = rec.id
          AND data_inicio = dt_cursor
      ) THEN
        INSERT INTO tarefas (
          empresa_id, usuario_id, titulo, descricao,
          status, prioridade, categoria,
          data_inicio, data_conclusao_prevista,
          tarefa_recorrente_id, gerado_automaticamente,
          posto_id
        ) VALUES (
          rec.empresa_id, rec.usuario_id, rec.titulo, rec.descricao,
          'em_andamento', rec.prioridade, rec.categoria,
          dt_cursor, dt_cursor,
          rec.id, true,
          rec.posto_id
        )
        ON CONFLICT DO NOTHING;

        v_count := v_count + 1;
      END IF;

      dt_cursor := dt_cursor + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION gerar_tarefas_conciliacao() TO authenticated;


-- Corrige gerar_tarefas_proximo_dia para também incluir posto_id
-- e usar is_dia_util_bancario (a versão de 025 usava is_dia_util)

CREATE OR REPLACE FUNCTION gerar_tarefas_proximo_dia()
RETURNS INT AS $$
DECLARE
  rec        tarefas_recorrentes%ROWTYPE;
  dt_ultimo  DATE;
  dt_proximo DATE;
  v_count    INT := 0;
BEGIN
  FOR rec IN
    SELECT * FROM tarefas_recorrentes
    WHERE ativo = true
      AND usuario_id = auth.uid()
  LOOP
    SELECT MAX(data_inicio) INTO dt_ultimo
    FROM tarefas
    WHERE tarefa_recorrente_id = rec.id
      AND gerado_automaticamente = true;

    IF dt_ultimo IS NULL THEN
      dt_ultimo := CURRENT_DATE - 1;
    END IF;

    dt_proximo := dt_ultimo + 1;

    -- Avança até o próximo dia útil bancário
    WHILE NOT is_dia_util_bancario(dt_proximo) LOOP
      dt_proximo := dt_proximo + 1;
    END LOOP;

    -- Não gera datas futuras
    IF dt_proximo > CURRENT_DATE THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM tarefas
      WHERE tarefa_recorrente_id = rec.id
        AND data_inicio = dt_proximo
    ) THEN
      INSERT INTO tarefas (
        empresa_id, usuario_id, titulo, descricao,
        status, prioridade, categoria,
        data_inicio, data_conclusao_prevista,
        tarefa_recorrente_id, gerado_automaticamente,
        posto_id
      ) VALUES (
        rec.empresa_id, rec.usuario_id, rec.titulo, rec.descricao,
        'em_andamento', rec.prioridade, rec.categoria,
        dt_proximo, dt_proximo,
        rec.id, true,
        rec.posto_id
      )
      ON CONFLICT DO NOTHING;

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION gerar_tarefas_proximo_dia() TO authenticated;


-- Backfill: preenche posto_id=NULL em tarefas auto-geradas existentes
UPDATE tarefas t
SET posto_id = tr.posto_id
FROM tarefas_recorrentes tr
WHERE t.tarefa_recorrente_id = tr.id
  AND t.gerado_automaticamente = true
  AND t.posto_id IS NULL
  AND tr.posto_id IS NOT NULL;
