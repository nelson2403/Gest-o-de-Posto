-- =====================================================================
-- 036_fix_limite_fim_de_semana.sql
-- Fix: when dt_limite falls on a weekend, move it back to the previous
-- Friday instead of skipping the entire recorrente.
-- Also inserts missing tasks for 2026-04-06 and 2026-04-07.
-- Sets tolerancia_dias = 0 so deadline = same day as start.
-- =====================================================================

-- ── 1. Set tolerancia_dias = 0 on all recorrentes (prazo = mesmo dia)
UPDATE tarefas_recorrentes SET tolerancia_dias = 0 WHERE ativo = true;

-- ── 2. Fix existing tasks: prazo = data_inicio ───────────────────────
UPDATE tarefas
SET data_conclusao_prevista = data_inicio
WHERE gerado_automaticamente = true
  AND data_conclusao_prevista <> data_inicio;

-- ── 3. Insert missing tasks for 2026-04-06 and 2026-04-07 ───────────
-- 2026-04-03 (Friday) was a national holiday (Sexta-Feira Santa)
DO $$
DECLARE
  rec tarefas_recorrentes%ROWTYPE;
  dia DATE;
BEGIN
  FOR rec IN SELECT * FROM tarefas_recorrentes WHERE ativo = true LOOP
    FOREACH dia IN ARRAY ARRAY['2026-04-06'::date, '2026-04-07'::date] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM tarefas
        WHERE tarefa_recorrente_id = rec.id
          AND data_inicio = dia
      ) THEN
        INSERT INTO tarefas (
          empresa_id, usuario_id, titulo, descricao,
          status, prioridade, categoria,
          data_inicio, data_conclusao_prevista,
          tarefa_recorrente_id, gerado_automaticamente
        ) VALUES (
          rec.empresa_id, rec.usuario_id, rec.titulo, rec.descricao,
          'em_andamento', rec.prioridade, rec.categoria,
          dia, dia,
          rec.id, true
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ── 4. Fix gerar_tarefas_conciliacao ────────────────────────────────
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
    -- Limit: today minus carencia (most recent day that should exist)
    dt_limite := CURRENT_DATE - rec.carencia_dias;

    -- If limit falls on weekend, move back to previous Friday
    WHILE EXTRACT(DOW FROM dt_limite) IN (0, 6) LOOP
      dt_limite := dt_limite - 1;
    END LOOP;

    -- Starting point: earliest existing date for this recorrente
    -- (capped at 30 days back to avoid going too far)
    SELECT MIN(data_inicio) INTO dt_primeiro
    FROM tarefas
    WHERE tarefa_recorrente_id = rec.id;

    IF dt_primeiro IS NULL THEN
      dt_cursor := dt_limite;
    ELSE
      dt_cursor := GREATEST(dt_primeiro, dt_limite - 30);
    END IF;

    -- Walk all business days up to the limit, inserting missing ones
    LOOP
      -- Skip weekends
      WHILE EXTRACT(DOW FROM dt_cursor) IN (0, 6) LOOP
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
          tarefa_recorrente_id, gerado_automaticamente
        ) VALUES (
          rec.empresa_id, rec.usuario_id, rec.titulo, rec.descricao,
          'em_andamento', rec.prioridade, rec.categoria,
          dt_cursor, dt_cursor,
          rec.id, true
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
