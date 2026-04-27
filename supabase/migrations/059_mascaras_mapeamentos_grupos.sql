-- ============================================================
-- MIGRATION 059: MAPEAMENTOS DE GRUPOS DE PRODUTOS
-- Vincula grupos de produtos do AUTOSYSTEM (grupo_produto.grid)
-- às linhas das máscaras — usado para apurar vendas/custos por
-- categoria de produto (combustível, conveniência, automotivos).
-- ============================================================

create table if not exists public.mascaras_mapeamentos_grupos (
  id           uuid        primary key default gen_random_uuid(),
  mascara_id   uuid        not null references public.mascaras(id) on delete cascade,
  linha_id     uuid        not null references public.mascaras_linhas(id) on delete cascade,
  grupo_grid   bigint      not null,
  criado_em    timestamptz not null default now(),
  -- Cada grupo de produto só pode estar vinculado a uma linha por máscara.
  unique (mascara_id, grupo_grid)
);

create index if not exists idx_mascaras_mapeamentos_grupos_linha   on public.mascaras_mapeamentos_grupos(linha_id);
create index if not exists idx_mascaras_mapeamentos_grupos_mascara on public.mascaras_mapeamentos_grupos(mascara_id);

alter table public.mascaras_mapeamentos_grupos enable row level security;

create policy "mascaras_mapeamentos_grupos_master_all" on public.mascaras_mapeamentos_grupos
  for all to authenticated
  using      (public.get_user_role() = 'master')
  with check (public.get_user_role() = 'master');
