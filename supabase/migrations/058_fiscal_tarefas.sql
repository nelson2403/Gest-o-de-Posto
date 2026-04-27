-- ============================================================
-- MIGRATION 058: MÓDULO FISCAL — TAREFAS DE NOTA FISCAL
-- Fluxo: Manifesto AS → Gerente anexa docs → Fiscal lança
-- ============================================================

create table if not exists public.fiscal_tarefas (
  id                   uuid        primary key default gen_random_uuid(),

  -- Referência AUTOSYSTEM
  nfe_resumo_grid      bigint,
  empresa_grid         bigint      not null,

  -- Dados da NF vindos do AS
  fornecedor_nome      text        not null,
  fornecedor_cpf       text,
  valor_as             numeric     not null,
  data_emissao         date,
  nfe_chave            text,

  -- Posto mapeado
  posto_id             uuid        references public.postos(id),

  -- Status do fluxo
  -- pendente_gerente → nf_anexada → aguardando_fiscal → concluida
  status               text        not null default 'pendente_gerente'
                         check (status in (
                           'pendente_gerente',
                           'nf_rejeitada',
                           'aguardando_fiscal',
                           'concluida'
                         )),

  -- Etapa 1: Nota Fiscal (Gerente)
  nf_url               text,
  nf_valor_informado   numeric,
  nf_aprovada          boolean,
  nf_aprovada_em       timestamptz,
  nf_anexada_em        timestamptz,
  nf_anexada_por       uuid        references public.usuarios(id),
  nf_rejeicao_motivo   text,

  -- Etapa 2: Boleto (Gerente)
  boleto_url           text,
  boleto_vencimento    date,
  boleto_valor         numeric,
  boleto_anexado_em    timestamptz,

  -- Etapa 3: Romaneio (Gerente)
  romaneio_url         text,
  romaneio_anexado_em  timestamptz,

  -- Etapa 4: Controle Fiscal
  lancado_em           timestamptz,
  lmc_entrada_doc      text,
  concluida_em         timestamptz,
  concluida_por        uuid        references public.usuarios(id),

  -- Metadata
  criada_em            timestamptz not null default now(),
  atualizada_em        timestamptz not null default now()
);

create index if not exists idx_fiscal_tarefas_status      on public.fiscal_tarefas(status);
create index if not exists idx_fiscal_tarefas_posto       on public.fiscal_tarefas(posto_id);
create index if not exists idx_fiscal_tarefas_empresa     on public.fiscal_tarefas(empresa_grid);
create index if not exists idx_fiscal_tarefas_nfe_grid    on public.fiscal_tarefas(nfe_resumo_grid);
create index if not exists idx_fiscal_tarefas_vencimento  on public.fiscal_tarefas(boleto_vencimento);

-- RLS
alter table public.fiscal_tarefas enable row level security;

create policy "fiscal_tarefas_select" on public.fiscal_tarefas
  for select to authenticated using (true);

create policy "fiscal_tarefas_insert" on public.fiscal_tarefas
  for insert to authenticated with check (true);

create policy "fiscal_tarefas_update" on public.fiscal_tarefas
  for update to authenticated using (true) with check (true);
