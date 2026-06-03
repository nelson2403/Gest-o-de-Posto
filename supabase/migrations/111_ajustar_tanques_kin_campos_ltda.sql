-- Atualiza os tanques do POSTO DO KIN para 15000 litros
-- G.C: 30000 → 15000 litros
-- ETANOL: 15000 litros (já estava correto)
-- Associado ao usuário lucas

UPDATE tanques_postos
SET capacidade_litros = 15000
WHERE posto_nome = 'POSTO DO KIN' AND produto = 'G.C';

-- Verifica as mudanças
SELECT posto_nome, produto, capacidade_litros
FROM tanques_postos
WHERE posto_nome = 'POSTO DO KIN'
ORDER BY ordem;
