-- Conciliação bancária: guarda o intervalo de datas do AUTOSYSTEM usado na
-- conferência do extrato. Em dias após feriado/fim de semana o banco liquida
-- tudo no próximo dia útil, então o movimento cobre vários dias. Guardar o
-- intervalo garante que a re-sincronização compare o mesmo período.

ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS extrato_datas_as jsonb;

NOTIFY pgrst, 'reload schema';
