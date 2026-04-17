-- =====================================================================
-- 017_gerar_por_usuario.sql
-- Faz com que as funções de geração de tarefas operem apenas sobre
-- as tarefas recorrentes do usuário que chamou a função (auth.uid()).
-- Isso garante que o botão "Gerar Próximo Dia" seja individual:
-- cada conciliador gera apenas suas próprias tarefas.
-- Execute no Supabase SQL Editor
-- =====================================================================

-- ── 1. gerar_tarefas_conciliacao (geração automática no carregamento) ──

CREATE OR REPLACE FUNCTION gerar_tarefas_conciliacao()
RETURNS INT AS $$
DECLARE
  rec      tarefas_recorrentes%ROWTYPE;
  dt_ref   DATE;
  dt_prazo DATE;
  v_count  INT := 0;
BEGIN
  FOR rec IN
    SELECT * FROM tarefas_recorrentes
    WHERE ativo = true
      AND usuario_id = auth.uid()          -- ← somente deste usuário
  LOOP
    dt_ref   := CURRENT_DATE - rec.carencia_dias;
    dt_prazo := dt_ref + rec.tolerancia_dias;

    -- Pula sábado (6) e domingo (0) — sem expediente bancário
    IF EXTRACT(DOW FROM dt_ref) IN (0, 6) THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM tarefas
      WHERE tarefa_recorrente_id = rec.id
        AND data_inicio = dt_ref
    ) THEN
      INSERT INTO tarefas (
        empresa_id, usuario_id, titulo, descricao,
        status, prioridade, categoria,
        data_inicio, data_conclusao_prevista,
        tarefa_recorrente_id, gerado_automaticamente
      ) VALUES (
        rec.empresa_id, rec.usuario_id, rec.titulo, rec.descricao,
        'em_andamento', rec.prioridade, rec.categoria,
        dt_ref, dt_prazo,
        rec.id, true
      )
      ON CONFLICT DO NOTHING;

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION gerar_tarefas_conciliacao() TO authenticated;


-- ── 2. gerar_tarefas_proximo_dia (botão "Gerar Próximo Dia") ──────────

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
    SELECT * FROM tarefas_recorrentes
    WHERE ativo = true
      AND usuario_id = auth.uid()          -- ← somente deste usuário
  LOOP
    -- Data mais recente já gerada para este recorrente
    SELECT MAX(data_inicio) INTO dt_ultimo
    FROM tarefas
    WHERE tarefa_recorrente_id = rec.id
      AND gerado_automaticamente = true;

    IF dt_ultimo IS NULL THEN
      dt_ultimo := CURRENT_DATE - rec.carencia_dias;
    END IF;

    dt_proximo := dt_ultimo + 1;

    -- Avança até o próximo dia útil se cair em fim de semana
    -- Sábado (+2 → segunda) | Domingo (+1 → segunda)
    WHILE EXTRACT(DOW FROM dt_proximo) IN (0, 6) LOOP
      dt_proximo := dt_proximo + 1;
    END LOOP;

    dt_prazo := dt_proximo + rec.tolerancia_dias;

    -- Não gera datas futuras (além de hoje)
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
