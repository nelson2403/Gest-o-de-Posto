-- =====================================================================
-- DIAGNÓSTICO — rode no Supabase SQL Editor
-- =====================================================================

-- 1. O que a função atual retorna para o CASTELAO?
SELECT *
FROM get_conciliacao_por_posto()
WHERE posto_nome ILIKE '%CASTELAO%';

-- 2. Confirma que o código da função usa posto_id (não tarefa_recorrente_id)
SELECT prosrc
FROM pg_proc
WHERE proname = 'get_conciliacao_por_posto';
