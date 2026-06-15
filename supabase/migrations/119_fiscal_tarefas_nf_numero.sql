-- Número da nota fiscal (nNF) para facilitar o reconhecimento das notas no
-- Painel Fiscal. Extraído da chave de acesso da NF (dígitos 26-34).

ALTER TABLE fiscal_tarefas ADD COLUMN IF NOT EXISTS nf_numero bigint;

NOTIFY pgrst, 'reload schema';
