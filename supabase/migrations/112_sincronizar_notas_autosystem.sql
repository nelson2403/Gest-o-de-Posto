-- Sincroniza painel fiscal com AUTOSYSTEM
-- Remove 2 notas que foram deletadas no AS mas permaneceram aqui

DELETE FROM public.fiscal_tarefas
WHERE id IN (
  '33d7e3ab-7199-4f2f-ae46-54f6ee703a23',  -- BIEGAI 3585 (2026-05-29, grid 62038320)
  '9ddfa2fe-34cd-4cdc-8588-288e20f89e4c'   -- MEGA COM 1200 (2026-05-28, grid 61934874)
);

-- Resultado: POSTO REAL SUL terá 6 notas (mesma quantidade do AUTOSYSTEM)
-- Verificação
SELECT
  COUNT(*) as total_notas,
  COUNT(DISTINCT caso WHEN status IN ('pendente_gerente', 'aguardando_fiscal') THEN 1 END) as ativas
FROM public.fiscal_tarefas
WHERE posto_id = (SELECT id FROM postos WHERE nome ILIKE '%REAL%SUL%' LIMIT 1);
