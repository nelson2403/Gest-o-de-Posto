-- Migration 090: adiciona posto_id em solicitacoes_pagamento para vincular boletos fiscais à conferência diária
ALTER TABLE public.solicitacoes_pagamento
  ADD COLUMN IF NOT EXISTS posto_id UUID REFERENCES public.postos(id);
