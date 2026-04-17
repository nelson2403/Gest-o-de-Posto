-- =====================================================================
-- 048_cr_grupos.sql
-- Tabela de mapeamento: conta_debitar do AUTOSYSTEM → grupo de recebíveis
-- Grupos fixos: dinheiro, cartoes, cheques, notas_prazo, faturas
-- =====================================================================

CREATE TABLE IF NOT EXISTS cr_contas_grupo (
  conta_debitar TEXT        PRIMARY KEY,
  grupo         TEXT        NOT NULL CHECK (grupo IN ('dinheiro','cartoes','cheques','notas_prazo','faturas')),
  conta_nome    TEXT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_por UUID REFERENCES usuarios(id)
);

ALTER TABLE cr_contas_grupo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cr_cg_select" ON cr_contas_grupo
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cr_cg_write" ON cr_contas_grupo
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND role IN ('master','admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND role IN ('master','admin'))
  );
