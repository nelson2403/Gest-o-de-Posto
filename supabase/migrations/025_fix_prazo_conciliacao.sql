-- =====================================================================
-- 025_fix_prazo_conciliacao.sql
-- Correções:
--   1. Corrigir prazo de tarefas auto-geradas → prazo = data_inicio.
--   2. Criar tabela feriados_nacionais (2026 e 2027).
--   3. Criar função is_dia_util() que checa fim de semana + feriado.
--   4. Corrigir get_conciliacao_por_posto() → SECURITY DEFINER
--      + coluna usuario_nome via tarefas_recorrentes.
--   5. Corrigir gerar_tarefas_conciliacao() → gera sempre o dia
--      útil anterior (ontem), pulando fins de semana e feriados.
--   6. Corrigir gerar_tarefas_proximo_dia() → pula fins de semana
--      e feriados ao avançar para o próximo dia.
-- Execute no Supabase SQL Editor
-- =====================================================================

-- ── 1. Corrigir prazo de tarefas auto-geradas ────────────────────────
UPDATE tarefas
SET data_conclusao_prevista = data_inicio
WHERE gerado_automaticamente = true
  AND categoria = 'conciliacao_bancaria'
  AND data_conclusao_prevista IS DISTINCT FROM data_inicio;

-- ── 2. Tabela de feriados nacionais ──────────────────────────────────
CREATE TABLE IF NOT EXISTS feriados_nacionais (
  data DATE PRIMARY KEY,
  nome TEXT NOT NULL
);

GRANT SELECT ON feriados_nacionais TO authenticated;

-- Feriados 2026 (Páscoa = 05/04/2026)
INSERT INTO feriados_nacionais (data, nome) VALUES
  ('2026-01-01', 'Confraternização Universal'),
  ('2026-02-17', 'Carnaval'),
  ('2026-04-03', 'Sexta-feira Santa'),
  ('2026-04-21', 'Tiradentes'),
  ('2026-05-01', 'Dia do Trabalho'),
  ('2026-06-04', 'Corpus Christi'),
  ('2026-09-07', 'Independência do Brasil'),
  ('2026-10-12', 'Nossa Senhora Aparecida'),
  ('2026-11-02', 'Finados'),
  ('2026-11-15', 'Proclamação da República'),
  ('2026-12-25', 'Natal')
ON CONFLICT DO NOTHING;

-- Feriados 2027 (Páscoa = 28/03/2027)
INSERT INTO feriados_nacionais (data, nome) VALUES
  ('2027-01-01', 'Confraternização Universal'),
  ('2027-02-09', 'Carnaval'),
  ('2027-03-26', 'Sexta-feira Santa'),
  ('2027-04-21', 'Tiradentes'),
  ('2027-05-01', 'Dia do Trabalho'),
  ('2027-05-27', 'Corpus Christi'),
  ('2027-09-07', 'Independência do Brasil'),
  ('2027-10-12', 'Nossa Senhora Aparecida'),
  ('2027-11-02', 'Finados'),
  ('2027-11-15', 'Proclamação da República'),
  ('2027-12-25', 'Natal')
ON CONFLICT DO NOTHING;

-- ── 3. Função auxiliar: verifica se é dia útil ───────────────────────
CREATE OR REPLACE FUNCTION is_dia_util(p_data DATE)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXTRACT(DOW FROM p_data) NOT IN (0, 6)
    AND NOT EXISTS (
      SELECT 1 FROM feriados_nacionais WHERE data = p_data
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION is_dia_util(DATE) TO authenticated;

-- ── 4. Corrigir get_conciliacao_por_posto ────────────────────────────
DROP FUNCTION IF EXISTS get_conciliacao_por_posto();

CREATE OR REPLACE FUNCTION get_conciliacao_por_posto()
RETURNS TABLE(
  posto_id                UUID,
  posto_nome              TEXT,
  status_tarefa           TEXT,
  data_inicio             DATE,
  data_conclusao_prevista DATE,
  data_conclusao_real     TIMESTAMPTZ,
  ultima_conclusao        DATE,
  usuario_nome            TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id                          AS posto_id,
    p.nome::TEXT                  AS posto_nome,
    t.status::TEXT                AS status_tarefa,
    t.data_inicio,
    t.data_conclusao_prevista,
    t.data_conclusao_real,
    uc.ultima_conclusao,
    resp.usuario_nome
  FROM postos p
  -- Responsável via tarefas_recorrentes (sempre disponível)
  LEFT JOIN LATERAL (
    SELECT u2.nome::TEXT AS usuario_nome
    FROM tarefas_recorrentes tr_r
    LEFT JOIN usuarios u2 ON u2.id = tr_r.usuario_id
    WHERE tr_r.posto_id = p.id
      AND tr_r.ativo = true
    LIMIT 1
  ) resp ON TRUE
  -- Tarefa aberta mais recente do posto
  LEFT JOIN LATERAL (
    SELECT
      t2.status,
      t2.data_inicio,
      t2.data_conclusao_prevista,
      t2.data_conclusao_real
    FROM tarefas t2
    INNER JOIN tarefas_recorrentes tr
      ON t2.tarefa_recorrente_id = tr.id
    WHERE tr.posto_id = p.id
      AND t2.categoria = 'conciliacao_bancaria'
      AND t2.status IN ('pendente', 'em_andamento')
    ORDER BY t2.data_conclusao_prevista DESC
    LIMIT 1
  ) t ON TRUE
  -- Último dia concluído do posto
  LEFT JOIN LATERAL (
    SELECT MAX(t3.data_conclusao_prevista) AS ultima_conclusao
    FROM tarefas t3
    INNER JOIN tarefas_recorrentes tr3
      ON t3.tarefa_recorrente_id = tr3.id
    WHERE tr3.posto_id = p.id
      AND t3.categoria = 'conciliacao_bancaria'
      AND t3.status = 'concluido'
  ) uc ON TRUE
  WHERE p.ativo = TRUE
  ORDER BY p.nome;
$$;

GRANT EXECUTE ON FUNCTION get_conciliacao_por_posto() TO authenticated;

-- ── 5. Corrigir gerar_tarefas_conciliacao ────────────────────────────
-- Gera sempre o dia útil anterior (ontem), recuando sobre fins de
-- semana e feriados nacionais.

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
    -- Limite = dia útil anterior (ontem, recuando se for fim de semana/feriado)
    dt_limite := CURRENT_DATE - 1;
    WHILE NOT is_dia_util(dt_limite) LOOP
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
      -- Avança cursor para o próximo dia útil
      WHILE NOT is_dia_util(dt_cursor) LOOP
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

-- ── 6. Corrigir gerar_tarefas_proximo_dia ────────────────────────────
-- Avança para o próximo dia útil pulando fins de semana e feriados.

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

    -- Avança até o próximo dia útil (pula fins de semana e feriados)
    WHILE NOT is_dia_util(dt_proximo) LOOP
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
        tarefa_recorrente_id, gerado_automaticamente
      ) VALUES (
        rec.empresa_id, rec.usuario_id, rec.titulo, rec.descricao,
        'em_andamento', rec.prioridade, rec.categoria,
        dt_proximo, dt_proximo,
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
