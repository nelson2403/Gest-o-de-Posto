-- ============================================================
-- 077_fornecedores_lista_mestre.sql
-- Adiciona campo codigo_conta e insere lista mestre de fornecedores
-- ============================================================

-- Adiciona coluna codigo_conta se ainda não existir
ALTER TABLE cp_fornecedores
  ADD COLUMN IF NOT EXISTS codigo_conta TEXT;

-- Insere fornecedores que ainda não existem (por nome, case-insensitive)
DO $$
DECLARE
  v_lista JSONB := '[
    {"nome": "POSTO ALTEROSA",                   "codigo": "6.990-6"},
    {"nome": "MARCO",                             "codigo": "10.331-4"},
    {"nome": "POSTO SETE IRMÃOS",                "codigo": "12.619-5"},
    {"nome": "AUTO POSTO CASTELÃO",              "codigo": "20.010-7"},
    {"nome": "AUTO POSTO POMBAL",                "codigo": "23.863-5"},
    {"nome": "TRANSPOMBAL",                       "codigo": "40.705-4"},
    {"nome": "FORTALEZA COM. DE COMB.",          "codigo": "42.043-3"},
    {"nome": "AUTO POSTO INDEPENDÊNCIA",         "codigo": "42.043-3"},
    {"nome": "AUTO POSTO SERENA",                "codigo": "43.030-4"},
    {"nome": "CASTELO COM. DE COMB.",            "codigo": "43.058-7"},
    {"nome": "A C SILVALOIA PEDRA POMBAL",       "codigo": "43.544-9"},
    {"nome": "AUTO POSTO CENTER DIVINO",         "codigo": "45.590-3"},
    {"nome": "HOTEL CASTELO EMPREENDIMENTOS",    "codigo": "47.235-2"},
    {"nome": "POSTO SÃO CRISTÓVÃO",             "codigo": "47.401-0"},
    {"nome": "SUDESTE COM. COMBUSTÍVEL",         "codigo": "56.726-1"},
    {"nome": "MULTI ADM E PUBLICIDADE",          "codigo": "94.058-5"},
    {"nome": "POSTO BELA VISTA",                 "codigo": "70.479-2 / AG3010"},
    {"nome": "AUTO POSTO CENTRAL",               "codigo": "43.925-8 / AG3001"},
    {"nome": "IMPERIAL",                          "codigo": "88.927-0 / 3008"},
    {"nome": "ROTA SUL - REAL SUL",              "codigo": "132.291-5"},
    {"nome": "POSTO SÃO PEDRO",                  "codigo": "132.299-1"},
    {"nome": "MONTE CASTELO",                    "codigo": "155.353-4"},
    {"nome": "ESTAÇÃO EMPREENDIMENTOS/MASSAS",   "codigo": "155.382-8"},
    {"nome": "RAQUEL",                            "codigo": "155.384-4"},
    {"nome": "POSTO REAL",                        "codigo": "158.093-0"},
    {"nome": "POSTO MAX BATURITÉ LTDA",          "codigo": "169.248-7"},
    {"nome": "RAMG PARTICIPAÇÕES",               "codigo": "190.910-0"},
    {"nome": "DO KIN",                            "codigo": "70.710-9"},
    {"nome": "DUJUCA COM E SERV LAVAGEM",        "codigo": "187.686-4"},
    {"nome": "POMBAL ITABAPOANA",                "codigo": "192.881-3"},
    {"nome": "GUARAMAR COMBUSTÍVEIS",            "codigo": "213.868-1"},
    {"nome": "NATIVA ADM",                        "codigo": "230.106-7"},
    {"nome": "CASTELINHO",                        "codigo": "260.135-4"},
    {"nome": "KIN CAMPOS/NOVA ERA",              "codigo": "275.839-3"},
    {"nome": "BONITO/RIO DOCE",                  "codigo": "277.785-1"},
    {"nome": "SANTA RITA",                        "codigo": "283.004-3"},
    {"nome": "POSTO FAITH",                       "codigo": "290.193-8"},
    {"nome": "I.C. GESTÃO E SOLUÇÕES",          "codigo": "297.562-9"}
  ]';
  v_item JSONB;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_lista) LOOP
    INSERT INTO cp_fornecedores (nome, codigo_conta, ativo)
    SELECT
      v_item->>'nome',
      v_item->>'codigo',
      true
    WHERE NOT EXISTS (
      SELECT 1 FROM cp_fornecedores
      WHERE LOWER(TRIM(nome)) = LOWER(TRIM(v_item->>'nome'))
    );
  END LOOP;
END;
$$;
