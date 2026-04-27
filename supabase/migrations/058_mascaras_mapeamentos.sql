-- ============================================================
-- MIGRATION 058: MAPEAMENTOS DAS MÁSCARAS
-- Vincula contas do plano de contas (AUTOSYSTEM, identificadas
-- por `grid`) às linhas das máscaras de DRE / Fluxo de Caixa.
-- ============================================================

create table if not exists public.mascaras_mapeamentos (
  id           uuid        primary key default gen_random_uuid(),
  mascara_id   uuid        not null references public.mascaras(id) on delete cascade,
  linha_id     uuid        not null references public.mascaras_linhas(id) on delete cascade,
  conta_grid   bigint      not null,
  criado_em    timestamptz not null default now(),
  -- Cada conta só pode estar vinculada a uma linha por máscara.
  unique (mascara_id, conta_grid)
);

create index if not exists idx_mascaras_mapeamentos_linha   on public.mascaras_mapeamentos(linha_id);
create index if not exists idx_mascaras_mapeamentos_mascara on public.mascaras_mapeamentos(mascara_id);

alter table public.mascaras_mapeamentos enable row level security;

create policy "mascaras_mapeamentos_master_all" on public.mascaras_mapeamentos
  for all to authenticated
  using      (public.get_user_role() = 'master')
  with check (public.get_user_role() = 'master');
