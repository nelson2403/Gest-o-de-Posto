-- Caixa agrupado: postos onde existe um caixa responsável que dá baixa nos
-- abastecimentos de TODOS os frentistas (em vez de cada frentista ser seu próprio
-- caixa). Nesses postos o fechamento consolida o POSTO INTEIRO do dia (vendas +
-- TEF + cartão/PIX manual de todos os usuários), inclusive as TEF baixadas por
-- outros usuários dentro do caixa agrupado.

ALTER TABLE postos ADD COLUMN IF NOT EXISTS caixa_agrupado boolean NOT NULL DEFAULT false;

UPDATE postos SET caixa_agrupado = true
WHERE nome ILIKE '%INDEPENDENCIA%'
   OR nome ILIKE '%CASTELAO%'
   OR nome ILIKE '%PEDRA DO POMBAL%';

NOTIFY pgrst, 'reload schema';
