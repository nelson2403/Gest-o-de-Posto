-- =====================================================================
-- 020_fix_geracao_automatica.sql
-- 1. Insere o dia 20/03/2026 que foi apagado na limpeza de duplicatas
-- 2. Corrige gerar_tarefas_conciliacao() para preencher todos os dias
--    úteis faltantes (não apenas o dia exato de hoje - carência),
--    evitando que gaps se repitam no futuro.
-- Execute no Supabase SQL Editor
-- =====================================================================

-- ── 1. Inserir dia 20/03/2026 (sem tolerância, prazo = mesmo dia) ────
DO $$
DECLARE
  rec tarefas_recorrentes%ROWTYPE;
BEGIN
  FOR rec IN SELECT * FROM tarefas_recorrentes WHERE ativo = true LOOP
    IF NOT EXISTS (
      SELECT 1 FROM tarefas
      WHERE tarefa_recorrente_id = rec.id
        AND data_inicio = '2026-03-20'
    ) THEN
      INSERT INTO tarefas (
        empresa_id, usuario_id, titulo, descricao,
        status, prioridade, categoria,
        data_inicio, data_conclusao_prevista,
        tarefa_recorrente_id, gerado_automaticamente
      ) VALUES (
        rec.empresa_id, rec.usuario_id, rec.titulo, rec.descricao,
        'em_andamento', rec.prioridade, rec.categoria,
        '2026-03-20'::date, '2026-03-20'::date,
        rec.id, true
      );
    END IF;
  END LOOP;
END $$;

-- ── 2. Corrigir gerar_tarefas_conciliacao ────────────────────────────
-- Estratégia: varre todos os dias úteis desde o MIN(data_inicio)
-- existente até (CURRENT_DATE - carencia_dias), preenchendo gaps.
-- Cap de 30 dias para não regredir indefinidamente.

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
    -- Limite: hoje menos a carência (dia mais recente que deve existir)
    dt_limite := CURRENT_DATE - rec.carencia_dias;

    -- Pula se o limite cair em fim de semana
    IF EXTRACT(DOW FROM dt_limite) IN (0, 6) THEN
      CONTINUE;
    END IF;

    -- Ponto de partida: menor data já existente para este recorrente
    -- (cap de 30 dias para não regredir demais)
    SELECT MIN(data_inicio) INTO dt_primeiro
    FROM tarefas
    WHERE tarefa_recorrente_id = rec.id;

    IF dt_primeiro IS NULL THEN
      dt_cursor := dt_limite;        -- sem histórico: gera só o limite
    ELSE
      dt_cursor := GREATEST(dt_primeiro, dt_limite - 30);
    END IF;

    -- Varre todos os dias úteis até o limite, inserindo os faltantes
    LOOP
      -- Pula fins de semana
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
          tarefa_recorrente_id, gerado_automaticamente
        ) VALUES (
          rec.empresa_id, rec.usuario_id, rec.titulo, rec.descricao,
          'em_andamento', rec.prioridade, rec.categoria,
          dt_cursor, dt_prazo,
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
