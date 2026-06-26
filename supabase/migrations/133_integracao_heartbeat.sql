-- ─────────────────────────────────────────────────────────────────────────────
-- 133_integracao_heartbeat.sql
-- Registra cada execução dos crons/integrações (batimento) para a tela de
-- Monitoramento conseguir mostrar "última sincronização" e detectar se parou.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.integracao_heartbeat (
  id           bigserial PRIMARY KEY,
  servico      text        NOT NULL,                 -- ex.: 'fiscal-sync', 'verificar-extratos'
  status       text        NOT NULL DEFAULT 'ok',    -- ok | erro | parcial
  duracao_ms   integer,
  detalhe      jsonb,
  executado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integracao_heartbeat_servico_data
  ON public.integracao_heartbeat (servico, executado_em DESC);

-- Acesso só via service role (as rotas de cron gravam e a API de monitoramento lê
-- com o admin client). RLS habilitada sem policies = nega para usuários comuns.
ALTER TABLE public.integracao_heartbeat ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
