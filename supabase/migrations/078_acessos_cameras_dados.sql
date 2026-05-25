-- Insere dados de acesso às câmeras de segurança por posto
-- Tipo 'icloud' = código serial Dahua/DMSS | Tipo 'ip' = endereço IP local

INSERT INTO acessos_cameras (posto_id, tipo, endereco, usuario, senha, porta)

(SELECT id, 'icloud', 'AZOM1200214BN', 'admin', 'ms21027676', 37777
 FROM postos WHERE nome ILIKE '%castelo%' AND nome NOT ILIKE '%monte%' AND nome NOT ILIKE '%inho%' AND nome NOT ILIKE '%lão%' AND nome NOT ILIKE '%lao%' LIMIT 1)

UNION ALL

(SELECT id, 'icloud', 'JTAJ1600233P9', 'admin', 'pombal79180', 37777
 FROM postos WHERE nome ILIKE '%estac%' LIMIT 1)

UNION ALL

(SELECT id, 'icloud', 'TFLM1103361SN', 'administrador', 'pombal07131', 37777
 FROM postos WHERE nome ILIKE '%burnier%' LIMIT 1)

UNION ALL

(SELECT id, 'icloud', '1ZRG2116756JK', 'monitor', 'monitor0788', 8060
 FROM postos WHERE nome ILIKE '%rio doce%' LIMIT 1)

UNION ALL

(SELECT id, 'icloud', 'DLY0002405187', 'admin', 'asdpoi12', 8060
 FROM postos WHERE nome ILIKE '%lavanderia%' LIMIT 1)

UNION ALL

(SELECT id, 'ip', '192.168.2.164', NULL, 'Pombal@102030', NULL
 FROM postos WHERE nome ILIKE '%rh%01%' OR nome ILIKE '%rh 01%' OR nome ILIKE '%r.h%01%' LIMIT 1)

UNION ALL

(SELECT id, 'ip', '192.168.2.165', NULL, 'Pombal@102030', NULL
 FROM postos WHERE nome ILIKE '%rh%02%' OR nome ILIKE '%rh 02%' OR nome ILIKE '%r.h%02%' LIMIT 1)

UNION ALL

(SELECT id, 'icloud', 'Ik1F41003365M', 'maykon', 'pombal103020', 3124
 FROM postos WHERE nome ILIKE '%coramara%' LIMIT 1)

UNION ALL

(SELECT id, 'icloud', 'EKHG4501986DG', NULL, NULL, 3123
 FROM postos WHERE nome ILIKE '%independ%' LIMIT 1)

UNION ALL

(SELECT id, 'icloud', 'KS7E3633381ZA', 'admin', 'admi3860', 38888
 FROM postos WHERE nome ILIKE '%crist%v%' OR nome ILIKE '%s_o cristov%' LIMIT 1)

UNION ALL

(SELECT id, 'icloud', '8J9M3703880VI', 'admin', 'poimnb12', 6090
 FROM postos WHERE nome ILIKE '%castelão%' OR nome ILIKE '%castelao%' LIMIT 1)

UNION ALL

(SELECT id, 'icloud', 'DXT0002917656', 'admin', 'asdpoi15', 7060
 FROM postos WHERE nome ILIKE '%fortaleza%' LIMIT 1)

UNION ALL

(SELECT id, 'icloud', 'KS7F45092063J', 'jhony', 'jhony2025', 37777
 FROM postos WHERE nome ILIKE '%center%' LIMIT 1)

UNION ALL

(SELECT id, 'icloud', 'KS7E361711787', 'luana', 'lu988445', 9050
 FROM postos WHERE nome ILIKE '%sete irm%' OR nome ILIKE '%7 irm%' LIMIT 1)

UNION ALL

(SELECT id, 'icloud', 'E32J2709906XH', 'admin', 'admin@#22', 37777
 FROM postos WHERE nome ILIKE '%real%sul%' OR nome ILIKE '%real sul%' LIMIT 1)

UNION ALL

(SELECT id, 'icloud', '8J9K4800529YC', 'admin', 'real103020@', 37777
 FROM postos WHERE nome ILIKE '%real%loja%' OR nome ILIKE '%real loja%' LIMIT 1)

UNION ALL

(SELECT id, 'icloud', '8J9K48005268N', 'admin', 'Pomb@l102030', 37777
 FROM postos WHERE nome ILIKE '%real%posto%' OR nome ILIKE '%real posto%' LIMIT 1)

UNION ALL

(SELECT id, 'icloud', '071H3901868V9', 'admin', 'antonella@23', 37777
 FROM postos WHERE nome ILIKE '%sagrado%' LIMIT 1)

UNION ALL

(SELECT id, 'icloud', '8J9M2602361XE', 'admin', 'asdzxc50', 9060
 FROM postos WHERE nome ILIKE '%bela vista%' LIMIT 1)

UNION ALL

(SELECT id, 'icloud', 'JTAJ1610459TK', 'admin', '471006pac', 37777
 FROM postos WHERE nome ILIKE '%central%' LIMIT 1)

UNION ALL

(SELECT id, 'icloud', '8J9L3101237VB', 'bramas', 'bram1292', 37777
 FROM postos WHERE nome ILIKE '%sudeste%' LIMIT 1)

UNION ALL

(SELECT id, 'icloud', 'TFLK3300422NU', 'admin', 'Cm123456', 37777
 FROM postos WHERE nome ILIKE '%kin%' LIMIT 1)

UNION ALL

(SELECT id, 'icloud', 'EWVK4402445JE', 'gerente', 'gerente123', 7090
 FROM postos WHERE nome ILIKE '%nova era%' LIMIT 1)

UNION ALL

(SELECT id, 'icloud', 'KS7E3613073K1', 'Taynara', 'Taynar@2026', 37777
 FROM postos WHERE nome ILIKE '%imperial%' LIMIT 1)

UNION ALL

(SELECT id, 'icloud', 'EKHH25004380M', 'gerente', 'Qwepoi89', 7020
 FROM postos WHERE nome ILIKE '%castelinho%' LIMIT 1)

UNION ALL

(SELECT id, 'icloud', 'N8BJ1000472IE', 'admin3', 'Castelao00204', 3123
 FROM postos WHERE nome ILIKE '%monte castelo%' LIMIT 1);
