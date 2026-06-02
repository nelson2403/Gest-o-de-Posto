-- =====================================================================
-- 095_conciliacao_multi_banco.sql
-- Suporte a múltiplos bancos na conciliação de extratos.
--
-- Antes: cada posto tinha apenas uma tarefa recorrente de conciliação
--   (Sicoob), sem identificação de qual banco era.
-- Agora: cada tarefa recorrente indica o banco e aponta diretamente
--   para a conta bancária correta (conta_bancaria_id), eliminando a
--   ambiguidade quando um posto tem mais de um banco.
-- =====================================================================

-- 1. Adiciona banco e conta_bancaria_id em tarefas_recorrentes
ALTER TABLE public.tarefas_recorrentes
  ADD COLUMN IF NOT EXISTS banco             TEXT,
  ADD COLUMN IF NOT EXISTS conta_bancaria_id UUID
    REFERENCES public.contas_bancarias(id) ON DELETE SET NULL;

-- 2. Adiciona as mesmas colunas em tarefas (propagadas na geração)
ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS banco             TEXT,
  ADD COLUMN IF NOT EXISTS conta_bancaria_id UUID
    REFERENCES public.contas_bancarias(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tarefas_banco             ON public.tarefas (banco);
CREATE INDEX IF NOT EXISTS idx_tarefas_conta_bancaria_id ON public.tarefas (conta_bancaria_id);

-- 3. Backfill tarefas_recorrentes existentes: tenta casar com contas_bancarias
--    Usa LOWER(banco) ILIKE '%sicoob%' / '%stone%' etc. via título da tarefa
UPDATE public.tarefas_recorrentes tr
SET
  conta_bancaria_id = cb.id,
  banco             = cb.banco
FROM public.contas_bancarias cb
WHERE cb.posto_id = tr.posto_id
  AND tr.banco IS NULL
  AND (
    -- Sicoob: título contém "sicoob"
    (lower(tr.titulo) LIKE '%sicoob%' AND lower(cb.banco) LIKE '%sicoob%')
    OR
    -- Stone: título contém "stone"
    (lower(tr.titulo) LIKE '%stone%'  AND lower(cb.banco) LIKE '%stone%')
    OR
    -- Banestes
    (lower(tr.titulo) LIKE '%banestes%' AND lower(cb.banco) LIKE '%banestes%')
    OR
    -- Santander
    (lower(tr.titulo) LIKE '%santander%' AND lower(cb.banco) LIKE '%santander%')
    OR
    -- Se só existe uma conta bancária para o posto, usa ela
    (NOT EXISTS (
      SELECT 1 FROM public.contas_bancarias cb2
      WHERE cb2.posto_id = tr.posto_id AND cb2.id <> cb.id
    ))
  );

-- 4. Backfill tarefas já geradas a partir das recorrentes atualizadas
UPDATE public.tarefas t
SET
  conta_bancaria_id = tr.conta_bancaria_id,
  banco             = tr.banco
FROM public.tarefas_recorrentes tr
WHERE t.tarefa_recorrente_id = tr.id
  AND t.gerado_automaticamente = true
  AND t.banco IS NULL
  AND tr.banco IS NOT NULL;

-- 5. Atualiza gerar_tarefas_conciliacao para propagar banco e conta_bancaria_id
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
    -- Limite = ontem, recuando até o último dia útil bancário
    dt_limite := CURRENT_DATE - 1;
    WHILE NOT is_dia_util_bancario(dt_limite) LOOP
      dt_limite := dt_limite - 1;
    END LOOP;

    -- Ponto de partida: primeiro dia já existente (cap 60 dias)
    SELECT MIN(data_inicio) INTO dt_primeiro
    FROM tarefas
    WHERE tarefa_recorrente_id = rec.id;

    IF dt_primeiro IS NULL THEN
      dt_cursor := dt_limite;
    ELSE
      dt_cursor := GREATEST(dt_primeiro, dt_limite - 60);
    END IF;

    -- Varre todos os dias úteis bancários até o limite
    LOOP
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
          tarefa_recorrente_id, gerado_automaticamente,
          posto_id,
          banco, conta_bancaria_id
        ) VALUES (
          rec.empresa_id, rec.usuario_id, rec.titulo, rec.descricao,
          'em_andamento', rec.prioridade, rec.categoria,
          dt_cursor, dt_cursor,
          rec.id, true,
          rec.posto_id,
          rec.banco, rec.conta_bancaria_id
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

-- 6. Atualiza gerar_tarefas_proximo_dia igualmente
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

    -- Avança até o próximo dia útil bancário
    WHILE NOT is_dia_util_bancario(dt_proximo) LOOP
      dt_proximo := dt_proximo + 1;
    END LOOP;

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
        tarefa_recorrente_id, gerado_automaticamente,
        posto_id,
        banco, conta_bancaria_id
      ) VALUES (
        rec.empresa_id, rec.usuario_id, rec.titulo, rec.descricao,
        'em_andamento', rec.prioridade, rec.categoria,
        dt_proximo, dt_proximo,
        rec.id, true,
        rec.posto_id,
        rec.banco, rec.conta_bancaria_id
      )
      ON CONFLICT DO NOTHING;

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION gerar_tarefas_proximo_dia() TO authenticated;
