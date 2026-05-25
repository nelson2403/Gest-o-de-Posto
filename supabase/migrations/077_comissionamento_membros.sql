-- ─────────────────────────────────────────────────────────────────────────────
-- 077_comissionamento_membros.sql
-- Tabela de membros do módulo Comissionamento
--
--   • Cada membro está vinculado a UM posto (postos.id)
--   • external_person_id = grid da tabela `pessoa` do AUTOSYSTEM (FK lógico)
--   • role:
--       - supervisor    — visão completa do tenant
--       - manager       — gerente do posto
--       - pit_boss      — chefe de pista
--       - oil_changer   — trocador de óleo
--       - seller        — vendedor (padrão)
--
-- Conserva nome/email no Supabase mesmo quando a pessoa do AUTOSYSTEM é
-- atualizada (snapshot da hora do cadastro, atualizável manualmente).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.comissio_membros (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id            UUID NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  external_person_id  TEXT,                                    -- pessoa.grid no AUTOSYSTEM
  nome                TEXT NOT NULL,
  email               TEXT,
  role                TEXT NOT NULL DEFAULT 'seller'
                       CHECK (role IN ('supervisor','manager','pit_boss','oil_changer','seller')),
  ativo               BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por          UUID REFERENCES public.usuarios(id),
  -- Garante que a mesma pessoa do AUTOSYSTEM não seja cadastrada duas vezes
  -- pro mesmo posto (NULL é permitido para casos sem vínculo externo).
  UNIQUE (posto_id, external_person_id)
);

CREATE INDEX IF NOT EXISTS idx_comissio_membros_posto    ON public.comissio_membros(posto_id);
CREATE INDEX IF NOT EXISTS idx_comissio_membros_role     ON public.comissio_membros(role);
CREATE INDEX IF NOT EXISTS idx_comissio_membros_ativo    ON public.comissio_membros(ativo) WHERE ativo = TRUE;
CREATE INDEX IF NOT EXISTS idx_comissio_membros_external ON public.comissio_membros(external_person_id);

-- Trigger pra `atualizado_em`
CREATE OR REPLACE FUNCTION public.touch_comissio_membros()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS comissio_membros_touch ON public.comissio_membros;
CREATE TRIGGER comissio_membros_touch
  BEFORE UPDATE ON public.comissio_membros
  FOR EACH ROW EXECUTE FUNCTION public.touch_comissio_membros();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.comissio_membros ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode listar (cadastro relativamente público).
CREATE POLICY "comissio_membros_select_authenticated"
  ON public.comissio_membros FOR SELECT
  TO authenticated
  USING (TRUE);

-- Master / adm_financeiro / rh podem fazer todas as operações.
CREATE POLICY "comissio_membros_admin_all"
  ON public.comissio_membros FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
        AND role IN ('master', 'adm_financeiro', 'rh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
        AND role IN ('master', 'adm_financeiro', 'rh')
    )
  );
