-- Marca notas canceladas no AUTOSYSTEM como rejeitadas aqui
-- Isso remove elas do painel (status 'nf_rejeitada' não aparece mais)

UPDATE public.fiscal_tarefas
SET
  status = 'nf_rejeitada',
  nf_rejeicao_motivo = 'Cancelada no AUTOSYSTEM',
  atualizada_em = now()
WHERE id IN (
  '33d7e3ab-7199-4f2f-ae46-54f6ee703a23',  -- BIEGAI 3585 (grid 62038320)
  '9ddfa2fe-34cd-4cdc-8588-288e20f89e4c'   -- MEGA COM 1200 (grid 61934874)
);

-- Resultado: POSTO REAL SUL mostrará apenas 6 notas ativas
SELECT COUNT(*) as notas_ativas
FROM public.fiscal_tarefas
WHERE
  posto_id = (SELECT id FROM postos WHERE nome ILIKE '%REAL%SUL%' LIMIT 1)
  AND status NOT IN ('nf_rejeitada', 'concluida', 'desconhecida');
