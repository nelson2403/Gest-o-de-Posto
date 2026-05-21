-- 079_fix_tarefas_recorrentes_duplicadas.sql
--
-- Problema: tarefas_recorrentes com duplicatas (mesmo usuario_id + posto_id)
-- geravam 2 tarefas por dia. E ao excluir uma, a função recriava na
-- próxima carga porque o NOT EXISTS (por tarefa_recorrente_id) voltava TRUE.
--
-- Correção:
-- 1. Remove tarefas auto-geradas duplicadas (mantém a mais antiga)
-- 2. Remove tarefas_recorrentes duplicadas (mantém a mais antiga)
-- 3. Atualiza gerar_tarefas_conciliacao para checar por (usuario_id, posto_id, data_inicio)
--    em vez de tarefa_recorrente_id — evita duplicatas mesmo com múltiplos registros recorrentes

-- ─── 1. Remove tarefas duplicadas auto-geradas ────────────────────────────────
DELETE FROM tarefas
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY usuario_id, posto_id, data_inicio, categoria
             ORDER BY id ASC
           ) AS rn
    FROM tarefas
    WHERE gerado_automaticamente = true
      AND posto_id IS NOT NULL
      AND categoria = 'conciliacao_bancaria'
  ) sub
  WHERE rn > 1
);

-- ─── 2. Remove tarefas_recorrentes duplicadas ────────────────────────────────
DELETE FROM tarefas_recorrentes
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY usuario_id, posto_id
             ORDER BY id ASC
           ) AS rn
    FROM tarefas_recorrentes
    WHERE ativo = true
      AND posto_id IS NOT NULL
  ) sub
  WHERE rn > 1
);

-- ─── 3. Corrige gerar_tarefas_conciliacao ────────────────────────────────────
-- Checa unicidade por (usuario_id, posto_id, data_inicio) em vez de tarefa_recorrente_id
-- Isso evita duplicatas mesmo que haja múltiplos registros recorrentes para o mesmo posto

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
    dt_limite := CURRENT_DATE - 1;
    WHILE NOT is_dia_util_bancario(dt_limite) LOOP
      dt_limite := dt_limite - 1;
    END LOOP;

    SELECT MIN(data_inicio) INTO dt_primeiro
    FROM tarefas
    WHERE usuario_id = rec.usuario_id
      AND posto_id   = rec.posto_id
      AND categoria  = 'conciliacao_bancaria';

    IF dt_primeiro IS NULL THEN
      dt_cursor := dt_limite;
    ELSE
      dt_cursor := GREATEST(dt_primeiro, dt_limite - 60);
    END IF;

    LOOP
      WHILE NOT is_dia_util_bancario(dt_cursor) LOOP
        dt_cursor := dt_cursor + 1;
      END LOOP;

      EXIT WHEN dt_cursor > dt_limite;

      -- Checa por usuario+posto+data, não por tarefa_recorrente_id
      -- Assim uma tarefa excluída/cancelada não é recriada se já existir outra
      IF NOT EXISTS (
        SELECT 1 FROM tarefas
        WHERE usuario_id = rec.usuario_id
          AND posto_id   = rec.posto_id
          AND categoria  = 'conciliacao_bancaria'
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
