-- ─── Preços Combustível por Posto ────────────────────────────────────────────
-- Armazena o preço vigente de cada produto por posto.
-- Quando o preço é alterado, o histórico é preservado pela tabela de status dos portais.
CREATE TABLE IF NOT EXISTS public.precos_combustivel (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id     UUID        NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  produto      TEXT        NOT NULL, -- 'Gasolina Comum', 'Gasolina Aditivada', 'Etanol', 'Diesel Comum', 'Diesel S-10', 'GNV'
  preco        NUMERIC(10,3) NOT NULL CHECK (preco >= 0),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_por UUID       REFERENCES auth.users(id),
  UNIQUE (posto_id, produto)
);

-- ─── Portais de Frotas ────────────────────────────────────────────────────────
-- Lista de portais onde os preços precisam ser cadastrados (Ticket, BR Frota, etc.)
CREATE TABLE IF NOT EXISTS public.portais_frotas (
  id        UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  nome      TEXT  NOT NULL,
  url       TEXT,
  ativo     BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Status de Atualização por Portal/Posto/Produto ──────────────────────────
-- Registra qual preço foi informado em cada portal, para cada posto e produto.
-- "Desatualizado" = preco_combustivel.preco != preco_no_portal OU nunca atualizado.
CREATE TABLE IF NOT EXISTS public.portais_frotas_status (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id       UUID         NOT NULL REFERENCES public.portais_frotas(id) ON DELETE CASCADE,
  posto_id        UUID         NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  produto         TEXT         NOT NULL,
  preco_no_portal NUMERIC(10,3),
  atualizado_em   TIMESTAMPTZ,
  usuario_id      UUID         REFERENCES auth.users(id),
  UNIQUE (portal_id, posto_id, produto)
);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.precos_combustivel    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portais_frotas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portais_frotas_status ENABLE ROW LEVEL SECURITY;

-- Apenas master e admin têm acesso (preços são sensíveis)
CREATE POLICY "precos_combustivel_select" ON public.precos_combustivel
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "precos_combustivel_modify" ON public.precos_combustivel
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "portais_frotas_select" ON public.portais_frotas
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "portais_frotas_modify" ON public.portais_frotas
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "portais_frotas_status_select" ON public.portais_frotas_status
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "portais_frotas_status_modify" ON public.portais_frotas_status
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Insere portais frotas comuns como ponto de partida
INSERT INTO public.portais_frotas (nome, url) VALUES
  ('Ticket Log',        'https://www.ticketlog.com.br'),
  ('BR Frota',          'https://www.brfrota.com.br'),
  ('Shell Card',        'https://www.shellcard.com.br'),
  ('Ipiranga Frotas',   'https://www.ipirangafrotas.com.br'),
  ('Sem Parar Frotas',  'https://www.semparar.com.br'),
  ('Coopercred',        NULL),
  ('ConectCar',         'https://www.conectcar.com'),
  ('Petrobras Frota',   NULL)
ON CONFLICT DO NOTHING;
