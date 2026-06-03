-- Atualiza os tanques do POSTO DO KIN para 15000 g.c e 15000 e.t
-- Associado ao usuário lucas (Kin Campos)

UPDATE tanques_postos
SET capacidade_litros = 15000
WHERE posto_nome = 'POSTO DO KIN' AND produto = 'G.C';

UPDATE tanques_postos
SET capacidade_litros = 15000
WHERE posto_nome = 'POSTO DO KIN' AND produto = 'ETANOL';

-- Verifica as mudanças
SELECT posto_nome, produto, capacidade_litros
FROM tanques_postos
WHERE posto_nome = 'POSTO DO KIN'
ORDER BY ordem;
