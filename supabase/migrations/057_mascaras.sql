-- ============================================================
-- MIGRATION 057: MÁSCARAS DRE / FLUXO DE CAIXA
-- Estruturas hierárquicas (templates) que serão posteriormente
-- mapeadas a contas do plano de contas.
-- ============================================================

-- ── Máscaras ──────────────────────────────────────────────────
create table if not exists public.mascaras (
  id            uuid        primary key default gen_random_uuid(),
  tipo          text        not null check (tipo in ('dre', 'fluxo_caixa')),
  nome          text        not null,
  descricao     text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_mascaras_tipo on public.mascaras(tipo);

-- ── Linhas das máscaras (estrutura hierárquica) ───────────────
create table if not exists public.mascaras_linhas (
  id            uuid        primary key default gen_random_uuid(),
  mascara_id    uuid        not null references public.mascaras(id) on delete cascade,
  parent_id     uuid        references public.mascaras_linhas(id) on delete cascade,
  ordem         int         not null default 0,
  nome          text        not null,
  tipo_linha    text        not null check (tipo_linha in ('grupo', 'subtotal')),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_mascaras_linhas_mascara on public.mascaras_linhas(mascara_id);
create index if not exists idx_mascaras_linhas_parent  on public.mascaras_linhas(parent_id);
create index if not exists idx_mascaras_linhas_ordem   on public.mascaras_linhas(mascara_id, parent_id, ordem);

-- ── RLS: somente master ───────────────────────────────────────
alter table public.mascaras         enable row level security;
alter table public.mascaras_linhas  enable row level security;

create policy "mascaras_master_all" on public.mascaras
  for all to authenticated
  using      (public.get_user_role() = 'master')
  with check (public.get_user_role() = 'master');

create policy "mascaras_linhas_master_all" on public.mascaras_linhas
  for all to authenticated
  using      (public.get_user_role() = 'master')
  with check (public.get_user_role() = 'master');
