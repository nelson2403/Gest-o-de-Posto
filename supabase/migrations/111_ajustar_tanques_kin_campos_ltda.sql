-- Atualiza os tanques do POSTO DO KIN CAMPOS LTDA para 15000 litros
-- G.C: 15000 litros e ETANOL: 15000 litros
-- Associado ao usuário lucas

UPDATE tanques_postos
SET capacidade_litros = 15000
WHERE posto_nome = 'POSTO DO KIN CAMPOS' AND produto = 'G.C';

UPDATE tanques_postos
SET capacidade_litros = 15000
WHERE posto_nome = 'POSTO DO KIN CAMPOS' AND produto = 'ETANOL';

-- Verifica as mudanças
SELECT posto_nome, produto, capacidade_litros
FROM tanques_postos
WHERE posto_nome = 'POSTO DO KIN CAMPOS'
ORDER BY ordem;
