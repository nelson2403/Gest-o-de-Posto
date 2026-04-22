-- ── Tanques por Posto ────────────────────────────────────────────────────────
create table if not exists tanques_postos (
  id                uuid    primary key default gen_random_uuid(),
  posto_nome        text    not null,
  bandeira          text    not null default 'BR',
  produto           text    not null,
  capacidade_litros integer not null,
  ordem             integer not null default 0,
  ativo             boolean not null default true,
  criado_em         timestamptz not null default now()
);

-- ── Medições Diárias ──────────────────────────────────────────────────────────
create table if not exists medicoes_tanques (
  id             uuid    primary key default gen_random_uuid(),
  tanque_id      uuid    not null references tanques_postos(id) on delete cascade,
  posto_nome     text    not null,
  data           date    not null default current_date,
  medida_litros  integer,
  usuario_id     uuid    references auth.users(id),
  criado_em      timestamptz not null default now(),
  unique(tanque_id, data)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table tanques_postos  enable row level security;
alter table medicoes_tanques enable row level security;

create policy "auth read tanques"       on tanques_postos  for select using (auth.uid() is not null);
create policy "auth read medicoes"      on medicoes_tanques for select using (auth.uid() is not null);
create policy "auth insert medicoes"    on medicoes_tanques for insert with check (auth.uid() is not null);
create policy "auth update medicoes"    on medicoes_tanques for update using (auth.uid() is not null);

-- ── Seed — Tanques por Posto ──────────────────────────────────────────────────
insert into tanques_postos (posto_nome, bandeira, produto, capacidade_litros, ordem) values

-- ── BR — FORTALEZA
('FORTALEZA','BR','G.C',30000,1),('FORTALEZA','BR','G.A',15000,2),
('FORTALEZA','BR','ETANOL',15000,3),('FORTALEZA','BR','D.C',15000,4),('FORTALEZA','BR','D.S-10',15000,5),

-- ── BR — BELA VISTA
('BELA VISTA','BR','G.C',30000,1),('BELA VISTA','BR','G.A',10000,2),
('BELA VISTA','BR','ETANOL',10000,3),('BELA VISTA','BR','D.C',20000,4),('BELA VISTA','BR','D.S-10',20000,5),

-- ── BR — CASTELO
('CASTELO','BR','G.C',30000,1),('CASTELO','BR','G.A',15000,2),
('CASTELO','BR','ETANOL',10000,3),('CASTELO','BR','D.C',30000,4),('CASTELO','BR','D.S-10',15000,5),

-- ── BR — SUDESTE
('SUDESTE','BR','G.C',15000,1),('SUDESTE','BR','G.A',15000,2),
('SUDESTE','BR','D.C',60000,3),('SUDESTE','BR','D.S-10',30000,4),

-- ── BR — SAGRADO
('SAGRADO','BR','G.C',20000,1),('SAGRADO','BR','G.A',10000,2),
('SAGRADO','BR','D.C',10000,3),('SAGRADO','BR','D.S-10',20000,4),

-- ── BR — POSTO DO KIN
('POSTO DO KIN','BR','G.C',30000,1),('POSTO DO KIN','BR','G.A',15000,2),
('POSTO DO KIN','BR','ETANOL',15000,3),('POSTO DO KIN','BR','D.C',30000,4),('POSTO DO KIN','BR','D.S-10',30000,5),

-- ── BR — POSTO IMPERIAL
('POSTO IMPERIAL','BR','G.C',15000,1),('POSTO IMPERIAL','BR','G.A',10000,2),
('POSTO IMPERIAL','BR','ETANOL',10000,3),('POSTO IMPERIAL','BR','D.C',10000,4),('POSTO IMPERIAL','BR','D.S-10',15000,5),

-- ── BR — POSTO RIO DOCE
('POSTO RIO DOCE','BR','G.C',15000,1),('POSTO RIO DOCE','BR','E.T',15000,2),
('POSTO RIO DOCE','BR','D.C',15000,3),('POSTO RIO DOCE','BR','D.S-10',15000,4),

-- ── BR — NOVA ERA
('NOVA ERA','BR','G.C',15000,1),('NOVA ERA','BR','E.T',15000,2),

-- ── SHELL — POMBAL
('POMBAL','SHELL','G.C',20000,1),('POMBAL','SHELL','G.A',10000,2),
('POMBAL','SHELL','ETANOL',10000,3),('POMBAL','SHELL','D.C',30000,4),('POMBAL','SHELL','D.S-10',35000,5),

-- ── SHELL — 7 IRMÃOS
('7 IRMÃOS','SHELL','G.C',30000,1),('7 IRMÃOS','SHELL','G.A',10000,2),
('7 IRMÃOS','SHELL','ETANOL',10000,3),('7 IRMÃOS','SHELL','D.C',15000,4),('7 IRMÃOS','SHELL','D.S-10',30000,5),

-- ── SHELL — CENTER
('CENTER','SHELL','G.C',30000,1),('CENTER','SHELL','G.A',15000,2),
('CENTER','SHELL','ETANOL',15000,3),('CENTER','SHELL','D.C',15000,4),('CENTER','SHELL','D.S-10',15000,5),

-- ── SHELL — SENNA
('SENNA','SHELL','G.C',30000,1),('SENNA','SHELL','G.A',15000,2),
('SENNA','SHELL','ETANOL',15000,3),('SENNA','SHELL','G.R',15000,4),('SENNA','SHELL','D.S-10',15000,5),

-- ── SHELL — ALTEROSA
('ALTEROSA','SHELL','G.C',20000,1),('ALTEROSA','SHELL','ETANOL',10000,2),
('ALTEROSA','SHELL','D.C',10000,3),('ALTEROSA','SHELL','D.S-10',20000,4),

-- ── SHELL — POSTO REAL
('POSTO REAL','SHELL','G.C',20000,1),('POSTO REAL','SHELL','G.A',15000,2),
('POSTO REAL','SHELL','ETANOL',10000,3),('POSTO REAL','SHELL','D.C',30000,4),('POSTO REAL','SHELL','D.S-10',45000,5),

-- ── SHELL — POSTO ESTAÇÃO
('POSTO ESTAÇÃO','SHELL','G.C',20000,1),('POSTO ESTAÇÃO','SHELL','G.A',10000,2),
('POSTO ESTAÇÃO','SHELL','D.C',15000,3),('POSTO ESTAÇÃO','SHELL','D.S-10',15000,4),

-- ── SHELL — POMBAL ITABAPOANA
('POMBAL ITABAPOANA','SHELL','G.C',20000,1),('POMBAL ITABAPOANA','SHELL','G.A',10000,2),
('POMBAL ITABAPOANA','SHELL','ETANOL',20000,3),('POMBAL ITABAPOANA','SHELL','D.C',20000,4),('POMBAL ITABAPOANA','SHELL','D.S-10',20000,5),

-- ── SHELL — POSTO FIATH
('POSTO FIATH','SHELL','G.C',20000,1),('POSTO FIATH','SHELL','G.A',15000,2),
('POSTO FIATH','SHELL','E.T',10000,3),('POSTO FIATH','SHELL','D.S-10',15000,4),

-- ── SHELL/IPIRANGA — CENTRAL
('CENTRAL','SHELL/IPIRANGA','G.C',15000,1),('CENTRAL','SHELL/IPIRANGA','G.A',15000,2),
('CENTRAL','SHELL/IPIRANGA','ETANOL',10000,3),('CENTRAL','SHELL/IPIRANGA','D.S-10',20000,4),

-- ── SHELL/IPIRANGA — CASTELÃO
('CASTELÃO','SHELL/IPIRANGA','G.C',15000,1),('CASTELÃO','SHELL/IPIRANGA','G.A',20000,2),
('CASTELÃO','SHELL/IPIRANGA','ETANOL',10000,3),('CASTELÃO','SHELL/IPIRANGA','D.C',30000,4),('CASTELÃO','SHELL/IPIRANGA','D.S-10',30000,5),

-- ── SHELL/IPIRANGA — SÃO CRISTOVÃO
('SÃO CRISTOVÃO','SHELL/IPIRANGA','G.C',20000,1),('SÃO CRISTOVÃO','SHELL/IPIRANGA','G.A',15000,2),
('SÃO CRISTOVÃO','SHELL/IPIRANGA','ETANOL',15000,3),('SÃO CRISTOVÃO','SHELL/IPIRANGA','D.C',15000,4),('SÃO CRISTOVÃO','SHELL/IPIRANGA','D.S-10',10000,5),

-- ── SHELL/IPIRANGA — ROTA SUL
('ROTA SUL','SHELL/IPIRANGA','G.A',10000,1),('ROTA SUL','SHELL/IPIRANGA','ETANOL',10000,2),
('ROTA SUL','SHELL/IPIRANGA','D.C',15000,3),('ROTA SUL','SHELL/IPIRANGA','D.S-10',55000,4),

-- ── SHELL/IPIRANGA — POSTO CAPRICHO
('POSTO CAPRICHO','SHELL/IPIRANGA','G.C',30000,1),('POSTO CAPRICHO','SHELL/IPIRANGA','G.A',15000,2),
('POSTO CAPRICHO','SHELL/IPIRANGA','ETANOL',15000,3),('POSTO CAPRICHO','SHELL/IPIRANGA','D.C',15000,4),('POSTO CAPRICHO','SHELL/IPIRANGA','D.S-10',15000,5),

-- ── SHELL/IPIRANGA — POSTO CASTELINHO
('POSTO CASTELINHO','SHELL/IPIRANGA','G.C',20000,1),('POSTO CASTELINHO','SHELL/IPIRANGA','G.A',15000,2),
('POSTO CASTELINHO','SHELL/IPIRANGA','ETANOL',10000,3),('POSTO CASTELINHO','SHELL/IPIRANGA','D.C',15000,4),('POSTO CASTELINHO','SHELL/IPIRANGA','D.S-10',30000,5),

-- ── SHELL/IPIRANGA — INDEPENDÊNCIA
('INDEPENDÊNCIA','SHELL/IPIRANGA','G.C',20000,1),('INDEPENDÊNCIA','SHELL/IPIRANGA','G.A',10000,2),
('INDEPENDÊNCIA','SHELL/IPIRANGA','ETANOL',10000,3),('INDEPENDÊNCIA','SHELL/IPIRANGA','D.C',30000,4),('INDEPENDÊNCIA','SHELL/IPIRANGA','D.S-10',50000,5),

-- ── SHELL/IPIRANGA — SANTA RITA
('SANTA RITA','SHELL/IPIRANGA','G.C',35000,1),('SANTA RITA','SHELL/IPIRANGA','G.A',10000,2),
('SANTA RITA','SHELL/IPIRANGA','ETANOL',20000,3),('SANTA RITA','SHELL/IPIRANGA','D.S-10',10000,4);
