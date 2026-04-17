-- =====================================================================
-- 009_tarefas.sql — Módulo de Gestão de Tarefas (Setor Financeiro/Fiscal)
-- =====================================================================

CREATE TABLE IF NOT EXISTS tarefas (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              UUID        NOT NULL REFERENCES empresas(id)  ON DELETE CASCADE,
  usuario_id              UUID        NOT NULL REFERENCES usuarios(id),
  titulo                  VARCHAR(255) NOT NULL,
  descricao               TEXT,
  status                  VARCHAR(50)  NOT NULL DEFAULT 'pendente'
                          CHECK (status IN ('pendente', 'em_andamento', 'concluido', 'cancelado')),
  prioridade              VARCHAR(50)  NOT NULL DEFAULT 'media'
                          CHECK (prioridade IN ('baixa', 'media', 'alta', 'urgente')),
  categoria               VARCHAR(100)
                          CHECK (categoria IN (
                            'fechamento_caixa',
                            'lancamento_notas',
                            'faturamento',
                            'conciliacao_bancaria',
                            'apuracao_impostos',
                            'folha_pagamento',
                            'relatorio_gerencial',
                            'auditoria',
                            'outros'
                          )),
  data_inicio             DATE,
  data_conclusao_prevista DATE,
  data_conclusao_real     TIMESTAMPTZ,
  observacoes             TEXT,
  criado_em               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_tarefas_empresa_id           ON tarefas (empresa_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_usuario_id           ON tarefas (usuario_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_status               ON tarefas (status);
CREATE INDEX IF NOT EXISTS idx_tarefas_prioridade           ON tarefas (prioridade);
CREATE INDEX IF NOT EXISTS idx_tarefas_data_conclusao       ON tarefas (data_conclusao_prevista);

-- Trigger de updated_at
CREATE TRIGGER trg_tarefas_updated_at
  BEFORE UPDATE ON tarefas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE tarefas ENABLE ROW LEVEL SECURITY;

-- ── SELECT ────────────────────────────────────────────────────────────
-- Master: vê todas as tarefas
CREATE POLICY "master_select_tarefas" ON tarefas
  FOR SELECT TO authenticated
  USING (get_user_role() = 'master');

-- Admin: vê todas as tarefas da sua empresa
CREATE POLICY "admin_select_tarefas" ON tarefas
  FOR SELECT TO authenticated
  USING (
    get_user_role() = 'admin'
    AND empresa_id = get_user_empresa_id()
  );

-- Operador: vê SOMENTE as próprias tarefas
CREATE POLICY "operador_select_tarefas" ON tarefas
  FOR SELECT TO authenticated
  USING (
    get_user_role() = 'operador'
    AND usuario_id = auth.uid()
  );

-- ── INSERT ────────────────────────────────────────────────────────────
-- Operador: insere apenas com seu próprio usuario_id e empresa
CREATE POLICY "operador_insert_tarefas" ON tarefas
  FOR INSERT TO authenticated
  WITH CHECK (
    get_user_role() = 'operador'
    AND usuario_id  = auth.uid()
    AND empresa_id  = get_user_empresa_id()
  );

-- Admin: insere para qualquer usuário da própria empresa
CREATE POLICY "admin_insert_tarefas" ON tarefas
  FOR INSERT TO authenticated
  WITH CHECK (
    get_user_role() = 'admin'
    AND empresa_id  = get_user_empresa_id()
  );

-- Master: insere sem restrição
CREATE POLICY "master_insert_tarefas" ON tarefas
  FOR INSERT TO authenticated
  WITH CHECK (get_user_role() = 'master');

-- ── UPDATE ────────────────────────────────────────────────────────────
-- Operador: atualiza apenas as próprias tarefas
CREATE POLICY "operador_update_tarefas" ON tarefas
  FOR UPDATE TO authenticated
  USING (
    get_user_role() = 'operador'
    AND usuario_id  = auth.uid()
  );

-- Admin: atualiza qualquer tarefa da empresa
CREATE POLICY "admin_update_tarefas" ON tarefas
  FOR UPDATE TO authenticated
  USING (
    get_user_role() = 'admin'
    AND empresa_id  = get_user_empresa_id()
  );

-- Master: atualiza tudo
CREATE POLICY "master_update_tarefas" ON tarefas
  FOR UPDATE TO authenticated
  USING (get_user_role() = 'master');

-- ── DELETE ────────────────────────────────────────────────────────────
-- Operador: NÃO pode excluir tarefas

-- Admin: exclui tarefas da própria empresa
CREATE POLICY "admin_delete_tarefas" ON tarefas
  FOR DELETE TO authenticated
  USING (
    get_user_role() = 'admin'
    AND empresa_id  = get_user_empresa_id()
  );

-- Master: exclui qualquer tarefa
CREATE POLICY "master_delete_tarefas" ON tarefas
  FOR DELETE TO authenticated
  USING (get_user_role() = 'master');
