-- Observações por conta no painel master de Saldos Bancários (motivo das divergências).
-- Uma observação por conta bancária; acesso apenas via service role (API master).

create table if not exists public.saldo_bancario_observacoes (
  conta_bancaria_id uuid primary key references public.contas_bancarias(id) on delete cascade,
  observacao        text        not null default '',
  atualizado_em     timestamptz not null default now(),
  atualizado_por    text
);

alter table public.saldo_bancario_observacoes enable row level security;
-- Sem policies: leitura/escrita somente pela API (service role), que já valida master.
