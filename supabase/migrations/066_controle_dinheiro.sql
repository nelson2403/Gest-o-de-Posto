-- ============================================================
-- MIGRATION 065: CONTROLE DE DINHEIRO
-- Configuração de quais contas do plano de contas (AUTOSYSTEM)
-- são tratadas como "contas de caixa/dinheiro" para o painel de
-- controle de dinheiro.
-- ============================================================

create table if not exists public.controle_dinheiro_contas (
  id            uuid        primary key default gen_random_uuid(),
  conta_grid    bigint      not null unique,  -- grid da conta no AUTOSYSTEM
  conta_codigo  text        not null,         -- denormalizado: codigo da conta (ex: '1.1.01')
  conta_nome    text,                         -- denormalizado: nome amigável
  ativo         boolean     not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_cd_contas_codigo on public.controle_dinheiro_contas(conta_codigo);

alter table public.controle_dinheiro_contas enable row level security;

create policy "controle_dinheiro_contas_master_all" on public.controle_dinheiro_contas
  for all to authenticated
  using      (public.get_user_role() = 'master')
  with check (public.get_user_role() = 'master');
