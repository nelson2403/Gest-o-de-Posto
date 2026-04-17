-- =====================================================================
-- 019_fix_dias_faltantes.sql
-- Insere o dia 19/03/2026 para todos os conciliadores que não o têm,
-- permitindo que marquem a conclusão desse dia.
-- Não altera nenhuma função nem regra existente.
-- Execute no Supabase SQL Editor
-- =====================================================================

DO $$
DECLARE
  rec tarefas_recorrentes%ROWTYPE;
BEGIN
  FOR rec IN SELECT * FROM tarefas_recorrentes WHERE ativo = true LOOP
    IF NOT EXISTS (
      SELECT 1 FROM tarefas
      WHERE tarefa_recorrente_id = rec.id
        AND data_inicio = '2026-03-19'
    ) THEN
      INSERT INTO tarefas (
        empresa_id, usuario_id, titulo, descricao,
        status, prioridade, categoria,
        data_inicio, data_conclusao_prevista,
        tarefa_recorrente_id, gerado_automaticamente
      ) VALUES (
        rec.empresa_id, rec.usuario_id, rec.titulo, rec.descricao,
        'em_andamento', rec.prioridade, rec.categoria,
        '2026-03-19'::date,
        '2026-03-19'::date + rec.tolerancia_dias,
        rec.id, true
      );
    END IF;
  END LOOP;
END $$;
