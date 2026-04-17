-- =====================================================================
-- 014_fix_tarefas_duplicadas.sql
-- Corrige tarefas geradas em duplicidade e previne futuras ocorrências
-- Execute no Supabase SQL Editor
-- =====================================================================

-- ── 1. Diagnóstico: ver quais tarefas_recorrentes estão duplicadas ────
-- (execute primeiro para conferir antes de deletar)
/*
SELECT
  tr.usuario_id,
  u.nome       AS usuario,
  tr.posto_id,
  p.nome       AS posto,
  tr.categoria,
  COUNT(*)     AS total
FROM tarefas_recorrentes tr
LEFT JOIN usuarios u ON u.id = tr.usuario_id
LEFT JOIN postos   p ON p.id = tr.posto_id
GROUP BY tr.usuario_id, u.nome, tr.posto_id, p.nome, tr.categoria
HAVING COUNT(*) > 1
ORDER BY total DESC;
*/

-- ── 2. Excluir tarefas geradas automaticamente em duplicidade ─────────
-- Mantém apenas a mais antiga por (tarefa_recorrente_id, data_inicio)
DELETE FROM tarefas
WHERE gerado_automaticamente = true
  AND id NOT IN (
    SELECT DISTINCT ON (tarefa_recorrente_id, data_inicio) id
    FROM tarefas
    WHERE gerado_automaticamente = true
    ORDER BY tarefa_recorrente_id, data_inicio, criado_em ASC
  );

-- ── 3. Excluir tarefas_recorrentes duplicadas ─────────────────────────
-- Para cada (usuario_id, posto_id, categoria), mantém apenas a mais antiga
DELETE FROM tarefas_recorrentes
WHERE id NOT IN (
  SELECT DISTINCT ON (usuario_id, COALESCE(posto_id::text, ''), categoria)
    id
  FROM tarefas_recorrentes
  ORDER BY usuario_id, COALESCE(posto_id::text, ''), categoria, criado_em ASC
);

-- ── 4. Adicionar UNIQUE constraint para evitar futuras duplicatas ──────
ALTER TABLE tarefas_recorrentes
  DROP CONSTRAINT IF EXISTS uq_tarefa_recorrente_usuario_posto_categoria;

ALTER TABLE tarefas_recorrentes
  ADD CONSTRAINT uq_tarefa_recorrente_usuario_posto_categoria
  UNIQUE (usuario_id, posto_id, categoria);

-- ── 5. Tornar a função de geração idempotente (ON CONFLICT DO NOTHING) ─
-- Reescreve a função para nunca criar duplicatas mesmo se chamada N vezes
CREATE OR REPLACE FUNCTION gerar_tarefas_conciliacao()
RETURNS INT AS $$
DECLARE
  rec      tarefas_recorrentes%ROWTYPE;
  dt_ref   DATE;
  dt_prazo DATE;
  v_count  INT := 0;
BEGIN
  FOR rec IN
    SELECT * FROM tarefas_recorrentes WHERE ativo = true
  LOOP
    dt_ref   := CURRENT_DATE - rec.carencia_dias;
    dt_prazo := dt_ref + rec.tolerancia_dias;

    -- Só insere se não existir (dupla garantia além do UNIQUE)
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
