-- Deleta notas canceladas no AUTOSYSTEM que não devem estar aqui
-- (O painel ainda mostraria 'nf_rejeitada', então DELETE é a solução)

DELETE FROM public.fiscal_tarefas
WHERE id IN (
  '33d7e3ab-7199-4f2f-ae46-54f6ee703a23',  -- BIEGAI 3585 (grid 62038320) - CANCELADA
  '9ddfa2fe-34cd-4cdc-8588-288e20f89e4c'   -- MEGA COM 1200 (grid 61934874) - CANCELADA
);

-- Verifica: POSTO REAL SUL deve ter apenas 6 notas
SELECT COUNT(*) as total_notas
FROM public.fiscal_tarefas
WHERE
  posto_id = (SELECT id FROM postos WHERE nome ILIKE '%REAL%SUL%' LIMIT 1)
  AND status IN ('pendente_gerente', 'aguardando_fiscal', 'nf_rejeitada');
