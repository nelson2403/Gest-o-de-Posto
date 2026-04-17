-- Adiciona coluna para mapear posto ao código de empresa do banco externo (Matrzi)
ALTER TABLE public.postos
ADD COLUMN IF NOT EXISTS codigo_empresa_externo TEXT UNIQUE;

COMMENT ON COLUMN public.postos.codigo_empresa_externo IS
  'Código da empresa no banco de dados externo (Matrzi/tabela caixa) para cruzamento do último caixa fechado';
