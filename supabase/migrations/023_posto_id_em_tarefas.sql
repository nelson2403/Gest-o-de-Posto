-- =====================================================================
-- 023_posto_id_em_tarefas.sql
-- Adiciona posto_id à tabela tarefas, backfill dos dados existentes,
-- atualiza funções de geração e recria get_conciliacao_por_posto.
-- Execute no Supabase SQL Editor
-- =====================================================================

-- 1. Adiciona coluna posto_id em tarefas
ALTER TABLE tarefas
  ADD COLUMN IF NOT EXISTS posto_id UUID REFERENCES postos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tarefas_posto_id ON tarefas(posto_id);

-- 2. Backfill: preenche posto_id das tarefas que já têm tarefa_recorrente_id
UPDATE tarefas t
SET posto_id = tr.posto_id
FROM tarefas_recorrentes tr
WHERE t.tarefa_recorrente_id = tr.id
  AND t.posto_id IS NULL
  AND tr.posto_id IS NOT NULL;

-- 3. Atualiza gerar_tarefas_conciliacao para incluir posto_id
CREATE OR REPLACE FUNCTION gerar_tarefas_conciliacao()
RETURNS INT AS $$
DECLARE
  rec         tarefas_recorrentes%ROWTYPE;
  dt_limite   DATE;
  dt_cursor   DATE;
  dt_primeiro DATE;
  dt_prazo    DATE;
  v_count     INT := 0;
BEGIN
  FOR rec IN
    SELECT * FROM tarefas_recorrentes
    WHERE ativo = true
      AND usuario_id = auth.uid()
  LOOP
    dt_limite := CURRENT_DATE - rec.carencia_dias;

    IF EXTRACT(DOW FROM dt_limite) IN (0, 6) THEN
      CONTINUE;
    END IF;

    SELECT MIN(data_inicio) INTO dt_primeiro
    FROM tarefas
    WHERE tarefa_recorrente_id = rec.id;

    IF dt_primeiro IS NULL THEN
      dt_cursor := dt_limite;
    ELSE
      dt_cursor := GREATEST(dt_primeiro, dt_limite - 30);
    END IF;

    LOOP
      WHILE EXTRACT(DOW FROM dt_cursor) IN (0, 6) LOOP
        dt_cursor := dt_cursor + 1;
      END LOOP;

      EXIT WHEN dt_cursor > dt_limite;

      dt_prazo := dt_cursor + rec.tolerancia_dias;

      IF NOT EXISTS (
        SELECT 1 FROM tarefas
        WHERE tarefa_recorrente_id = rec.id
          AND data_inicio = dt_cursor
      ) THEN
        INSERT INTO tarefas (
          empresa_id, usuario_id, titulo, descricao,
          status, prioridade, categoria,
          data_inicio, data_conclusao_prevista,
          tarefa_recorrente_id, gerado_automaticamente, posto_id
        ) VALUES (
          rec.empresa_id, rec.usuario_id, rec.titulo, rec.descricao,
          'em_andamento', rec.prioridade, rec.categoria,
          dt_cursor, dt_prazo,
          rec.id, true, rec.posto_id
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

-- 4. Atualiza gerar_tarefas_proximo_dia para incluir posto_id
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
    SELECT MAX(data_inicio) INTO dt_ultimo
    FROM tarefas
    WHERE tarefa_recorrente_id = rec.id
      AND gerado_automaticamente = true;

    IF dt_ultimo IS NULL THEN
      dt_ultimo := CURRENT_DATE - rec.carencia_dias;
    END IF;

    dt_proximo := dt_ultimo + 1;
    dt_prazo   := dt_proximo + rec.tolerancia_dias;

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
        tarefa_recorrente_id, gerado_automaticamente, posto_id
      ) VALUES (
        rec.empresa_id, rec.usuario_id, rec.titulo, rec.descricao,
        'em_andamento', rec.prioridade, rec.categoria,
        dt_proximo, dt_prazo,
        rec.id, true, rec.posto_id
      )
      ON CONFLICT DO NOTHING;

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION gerar_tarefas_proximo_dia() TO authenticated;

-- 5. Recria get_conciliacao_por_posto usando posto_id diretamente
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
  -- Tarefa aberta mais recente do posto
  LEFT JOIN LATERAL (
    SELECT
      t2.status,
      t2.data_inicio,
      t2.data_conclusao_prevista,
      t2.data_conclusao_real
    FROM tarefas t2
    WHERE t2.posto_id = p.id
      AND t2.categoria = 'conciliacao_bancaria'
      AND t2.status IN ('pendente', 'em_andamento')
    ORDER BY t2.data_conclusao_prevista DESC
    LIMIT 1
  ) t ON TRUE
  -- Último dia concluído do posto
  LEFT JOIN LATERAL (
    SELECT MAX(t3.data_conclusao_prevista) AS ultima_conclusao
    FROM tarefas t3
    WHERE t3.posto_id = p.id
      AND t3.categoria = 'conciliacao_bancaria'
      AND t3.status = 'concluido'
  ) uc ON TRUE
  WHERE p.ativo = TRUE
  ORDER BY p.nome;
$$;

GRANT EXECUTE ON FUNCTION get_conciliacao_por_posto() TO authenticated;
