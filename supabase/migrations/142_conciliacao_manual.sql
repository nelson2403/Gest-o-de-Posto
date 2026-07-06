-- Confirmação da Conciliação: D-Para manual entre a linha do extrato do banco e
-- a linha do AUTOSYSTEM (movto na conta corrente). Cada registro liga UMA linha
-- do banco a UMA linha do sistema (1:1), para ciência/auditoria dos donos.

create table if not exists public.conciliacao_manual (
  id                 uuid primary key default gen_random_uuid(),
  conta_bancaria_id  uuid not null references public.contas_bancarias(id) on delete cascade,
  posto_id           uuid references public.postos(id) on delete set null,

  -- linha do EXTRATO DO BANCO (não tem id estável → hash determinístico)
  banco_hash         text not null,
  banco_data         date,
  banco_valor        numeric,
  banco_descricao    text,

  -- linha do AUTOSYSTEM (grid do movto = id estável)
  as_grid            text not null,
  as_data            date,
  as_valor           numeric,
  as_descricao       text,

  conciliado_por     uuid references public.usuarios(id) on delete set null,
  criado_em          timestamptz not null default now(),

  -- 1:1 — cada linha (de cada lado) só pode estar em uma conciliação por conta
  unique (conta_bancaria_id, banco_hash),
  unique (conta_bancaria_id, as_grid)
);

create index if not exists idx_conciliacao_manual_conta on public.conciliacao_manual (conta_bancaria_id);

-- Só as rotas de servidor (service role / master) mexem nesta tabela.
alter table public.conciliacao_manual enable row level security;
