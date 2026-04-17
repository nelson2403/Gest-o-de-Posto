-- =====================================================================
-- 044_gerar_dia_especial.sql
-- Cria função gerar_tarefas_dia_especial(p_data DATE) para gerar
-- tarefas de conciliação em datas que normalmente seriam puladas
-- (feriados com expediente bancário, pontos facultativos, etc.)
--
-- Diferenças em relação à gerar_tarefas_conciliacao():
--  • Aceita uma data específica como parâmetro
--  • NÃO verifica fins de semana nem feriados (propósito: gerar exatamente
--    em dias que normalmente seriam pulados mas tiveram expediente)
--  • Cria para TODOS os tarefas_recorrentes ativos da empresa (não só
--    do usuário logado) — uso exclusivo de master/admin
--  • ON CONFLICT DO NOTHING garante que não duplica se a tarefa já existir
-- =====================================================================

CREATE OR REPLACE FUNCTION gerar_tarefas_dia_especial(p_data DATE)
RETURNS INT AS $$
DECLARE
  rec     tarefas_recorrentes%ROWTYPE;
  dt_prazo DATE;
  v_count  INT := 0;
  v_empresa_id UUID;
BEGIN
  -- Resolve a empresa do usuário chamador
  SELECT empresa_id INTO v_empresa_id
  FROM usuarios WHERE id = auth.uid();

  FOR rec IN
    SELECT * FROM tarefas_recorrentes
    WHERE ativo = true
      AND (v_empresa_id IS NULL OR empresa_id = v_empresa_id)
  LOOP
    dt_prazo := p_data + rec.tolerancia_dias;

    IF NOT EXISTS (
      SELECT 1 FROM tarefas
      WHERE tarefa_recorrente_id = rec.id
        AND data_inicio = p_data
    ) THEN
      INSERT INTO tarefas (
        empresa_id, usuario_id, titulo, descricao,
        status, prioridade, categoria,
        data_inicio, data_conclusao_prevista,
        tarefa_recorrente_id, gerado_automaticamente, posto_id
      ) VALUES (
        rec.empresa_id, rec.usuario_id, rec.titulo, rec.descricao,
        'em_andamento', rec.prioridade, rec.categoria,
        p_data, dt_prazo,
        rec.id, true, rec.posto_id
      )
      ON CONFLICT DO NOTHING;

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION gerar_tarefas_dia_especial(DATE) TO authenticated;
