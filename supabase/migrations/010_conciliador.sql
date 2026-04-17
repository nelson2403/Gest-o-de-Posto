-- =====================================================================
-- 010_conciliador.sql — Perfil Conciliador + Tarefas Recorrentes
-- =====================================================================

-- ── 1. Corrigir/garantir função de trigger atualizado_em ─────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 2. Adicionar role 'conciliador' na tabela usuarios ───────────────
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_role_check;
ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_role_check
  CHECK (role IN ('master', 'admin', 'operador', 'conciliador'));

-- ── 3. Colunas extras na tabela tarefas ──────────────────────────────
ALTER TABLE tarefas
  ADD COLUMN IF NOT EXISTS tarefa_recorrente_id  UUID,
  ADD COLUMN IF NOT EXISTS gerado_automaticamente BOOLEAN NOT NULL DEFAULT false;

-- ── 4. Tabela: tarefas_recorrentes ───────────────────────────────────
-- Define quais tarefas devem ser geradas automaticamente para conciliadores
CREATE TABLE IF NOT EXISTS tarefas_recorrentes (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id          UUID        NOT NULL REFERENCES usuarios(id),
  posto_id            UUID        REFERENCES postos(id) ON DELETE SET NULL,
  titulo              VARCHAR(255) NOT NULL,
  descricao           TEXT,
  categoria           VARCHAR(100) DEFAULT 'conciliacao_bancaria'
                      CHECK (categoria IN (
                        'fechamento_caixa','lancamento_notas','faturamento',
                        'conciliacao_bancaria','apuracao_impostos',
                        'folha_pagamento','relatorio_gerencial','auditoria','outros'
                      )),
  prioridade          VARCHAR(50)  NOT NULL DEFAULT 'alta'
                      CHECK (prioridade IN ('baixa', 'media', 'alta', 'urgente')),
  -- Carência: quantos dias atrás é a data de referência (padrão 4)
  carencia_dias       INT          NOT NULL DEFAULT 4,
  -- Tolerância: após quantos dias extras a tarefa vira "atrasada" (padrão 1)
  tolerancia_dias     INT          NOT NULL DEFAULT 1,
  ativo               BOOLEAN      NOT NULL DEFAULT true,
  criado_em           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tarefas_recorrentes_usuario ON tarefas_recorrentes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_recorrentes_empresa ON tarefas_recorrentes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_recorrentes_ativo   ON tarefas_recorrentes(ativo);

DROP TRIGGER IF EXISTS trg_tarefas_recorrentes_updated_at ON tarefas_recorrentes;
CREATE TRIGGER trg_tarefas_recorrentes_updated_at
  BEFORE UPDATE ON tarefas_recorrentes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- FK de tarefas → tarefas_recorrentes (adicionada após criação da tabela)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_tarefas_recorrente'
      AND table_name = 'tarefas'
  ) THEN
    ALTER TABLE tarefas
      ADD CONSTRAINT fk_tarefas_recorrente
      FOREIGN KEY (tarefa_recorrente_id)
      REFERENCES tarefas_recorrentes(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- ── 5. RLS em tarefas_recorrentes ────────────────────────────────────
ALTER TABLE tarefas_recorrentes ENABLE ROW LEVEL SECURITY;

-- Master: tudo
CREATE POLICY "master_all_tarefas_recorrentes" ON tarefas_recorrentes
  FOR ALL TO authenticated
  USING (get_user_role() = 'master')
  WITH CHECK (get_user_role() = 'master');

-- Admin: apenas da própria empresa
CREATE POLICY "admin_all_tarefas_recorrentes" ON tarefas_recorrentes
  FOR ALL TO authenticated
  USING  (get_user_role() = 'admin' AND empresa_id = get_user_empresa_id())
  WITH CHECK (get_user_role() = 'admin' AND empresa_id = get_user_empresa_id());

-- Conciliador: apenas visualiza as suas
CREATE POLICY "conciliador_select_tarefas_recorrentes" ON tarefas_recorrentes
  FOR SELECT TO authenticated
  USING (get_user_role() = 'conciliador' AND usuario_id = auth.uid());

-- ── 6. RLS em tarefas para conciliador ───────────────────────────────
-- Conciliador vê somente as próprias tarefas
CREATE POLICY "conciliador_select_tarefas" ON tarefas
  FOR SELECT TO authenticated
  USING (get_user_role() = 'conciliador' AND usuario_id = auth.uid());

-- Conciliador só pode atualizar (marcar como concluído) — não cria nem deleta
CREATE POLICY "conciliador_update_tarefas" ON tarefas
  FOR UPDATE TO authenticated
  USING  (get_user_role() = 'conciliador' AND usuario_id = auth.uid())
  WITH CHECK (get_user_role() = 'conciliador' AND usuario_id = auth.uid());

-- ── 7. Função para gerar tarefas de conciliação automaticamente ──────
-- Deve ser chamada diariamente (via CRON no Supabase ou no login do conciliador)
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
    -- Data de referência = hoje - carência (ex: hoje - 4 dias)
    dt_ref   := CURRENT_DATE - rec.carencia_dias;
    -- Prazo = dia de referência + tolerância (ex: referência + 1 dia)
    dt_prazo := dt_ref + rec.tolerancia_dias;

    -- Só gera se ainda não existe tarefa para esse recorrente nessa data
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
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION gerar_tarefas_conciliacao() TO authenticated;

-- ── 8. Índice extra em tarefas para consultas do conciliador ─────────
CREATE INDEX IF NOT EXISTS idx_tarefas_recorrente_id ON tarefas(tarefa_recorrente_id);
