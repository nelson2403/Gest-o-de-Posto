-- =====================================================================
-- 037_feriados_bancarios.sql
-- Cria tabela de feriados bancários (Sicoob) e atualiza a função de
-- geração de tarefas para pular fins de semana e feriados.
-- =====================================================================

-- ── 1. Tabela de feriados bancários ──────────────────────────────────
CREATE TABLE IF NOT EXISTS feriados_bancarios (
  data        DATE PRIMARY KEY,
  descricao   TEXT NOT NULL
);

ALTER TABLE feriados_bancarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feriados_select" ON feriados_bancarios;
DROP POLICY IF EXISTS "feriados_write" ON feriados_bancarios;

CREATE POLICY "feriados_select" ON feriados_bancarios
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "feriados_write" ON feriados_bancarios
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE id = auth.uid() AND role IN ('master', 'admin')
    )
  );

-- ── 2. Feriados 2026 — Nacionais + Estaduais ES (Sicoob) ────────────
INSERT INTO feriados_bancarios (data, descricao) VALUES
  -- Nacionais
  ('2026-01-01', 'Confraternização Universal'),
  ('2026-02-16', 'Carnaval'),
  ('2026-02-17', 'Carnaval'),
  ('2026-02-18', 'Quarta-feira de Cinzas'),
  ('2026-04-03', 'Sexta-Feira Santa'),
  ('2026-04-21', 'Tiradentes'),
  ('2026-05-01', 'Dia do Trabalho'),
  ('2026-06-04', 'Corpus Christi'),
  ('2026-09-07', 'Independência do Brasil'),
  ('2026-10-12', 'Nossa Senhora Aparecida'),
  ('2026-11-02', 'Finados'),
  ('2026-11-15', 'Proclamação da República'),
  ('2026-11-20', 'Consciência Negra'),
  ('2026-12-24', 'Véspera de Natal'),
  ('2026-12-25', 'Natal'),
  ('2026-12-31', 'Véspera de Ano Novo'),
  -- Estaduais — Espírito Santo
  ('2026-04-13', 'Aniversário do Espírito Santo'),
  ('2026-10-28', 'Dia do Servidor Público (ES)')
ON CONFLICT DO NOTHING;

-- ── 3. Função auxiliar: verifica se é dia útil bancário ──────────────
CREATE OR REPLACE FUNCTION is_dia_util_bancario(d DATE)
RETURNS BOOLEAN AS $$
BEGIN
  IF EXTRACT(DOW FROM d) IN (0, 6) THEN RETURN FALSE; END IF;
  IF EXISTS (SELECT 1 FROM feriados_bancarios WHERE data = d) THEN RETURN FALSE; END IF;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION is_dia_util_bancario(DATE) TO authenticated;

-- ── 4. Atualiza gerar_tarefas_conciliacao ────────────────────────────
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
    dt_limite := CURRENT_DATE - rec.carencia_dias;

    -- Recua até o dia útil bancário anterior
    WHILE NOT is_dia_util_bancario(dt_limite) LOOP
      dt_limite := dt_limite - 1;
    END LOOP;

    SELECT MIN(data_inicio) INTO dt_primeiro
    FROM tarefas
    WHERE tarefa_recorrente_id = rec.id;

    IF dt_primeiro IS NULL THEN
      dt_cursor := dt_limite;
    ELSE
      dt_cursor := GREATEST(dt_primeiro, dt_limite - 30);
    END IF;

    LOOP
      -- Avança até o próximo dia útil bancário
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
