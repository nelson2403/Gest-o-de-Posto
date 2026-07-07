-- Confirmação da Conciliação: D-Para manual entre linhas do extrato do banco e
-- linhas do AUTOSYSTEM (movto na conta corrente). Uma conciliação é um GRUPO que
-- pode conter N linhas do banco e M linhas do sistema (ex.: 1 crédito do banco =
-- 2 baixas no sistema). Cada linha só pode estar em um grupo por conta.

drop table if exists public.conciliacao_manual;

create table public.conciliacao_manual (
  id                 uuid primary key default gen_random_uuid(),
  conta_bancaria_id  uuid not null references public.contas_bancarias(id) on delete cascade,
  posto_id           uuid references public.postos(id) on delete set null,

  grupo_id           uuid not null,                 -- agrupa as linhas conciliadas juntas
  lado               text not null check (lado in ('banco','sistema')),
  linha_hash         text not null,                 -- banco: hash determinístico; sistema: grid do movto
  linha_data         date,
  linha_valor        numeric,
  linha_descricao    text,

  conciliado_por     uuid references public.usuarios(id) on delete set null,
  criado_em          timestamptz not null default now(),

  -- cada linha (de cada lado) só participa de UM grupo por conta
  unique (conta_bancaria_id, lado, linha_hash)
);

create index if not exists idx_conciliacao_manual_conta on public.conciliacao_manual (conta_bancaria_id);
create index if not exists idx_conciliacao_manual_grupo on public.conciliacao_manual (grupo_id);

-- Só as rotas de servidor (service role / master) mexem nesta tabela.
alter table public.conciliacao_manual enable row level security;
