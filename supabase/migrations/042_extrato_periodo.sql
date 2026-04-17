-- Adiciona coluna para rastrear início do período em extratos multi-dias
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS extrato_periodo_ini date;
