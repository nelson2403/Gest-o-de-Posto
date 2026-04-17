-- Migration 028: Fechador pode ter múltiplos postos (junction table)

-- ─── 1. Tabela de relacionamento N:N ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.usuario_postos_fechamento (
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  posto_id   UUID NOT NULL REFERENCES public.postos(id)   ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, posto_id)
);

CREATE INDEX IF NOT EXISTS idx_upf_usuario ON public.usuario_postos_fechamento(usuario_id);
CREATE INDEX IF NOT EXISTS idx_upf_posto   ON public.usuario_postos_fechamento(posto_id);

-- ─── 2. Migrar dados existentes ────────────────────────────────────────────────
-- Fecha­dores que já tinham posto_fechamento_id preenchido recebem o registro na nova tabela
INSERT INTO public.usuario_postos_fechamento (usuario_id, posto_id)
SELECT id, posto_fechamento_id
FROM   public.usuarios
WHERE  role = 'fechador'
  AND  posto_fechamento_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ─── 3. Função helper — retorna array de posto_ids do fechador logado ──────────
CREATE OR REPLACE FUNCTION public.get_user_postos_fechamento_ids()
RETURNS UUID[] AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT posto_id
      FROM   public.usuario_postos_fechamento
      WHERE  usuario_id = auth.uid()
    ),
    '{}'::UUID[]
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─── 4. RLS na nova tabela ─────────────────────────────────────────────────────
ALTER TABLE public.usuario_postos_fechamento ENABLE ROW LEVEL SECURITY;

-- master vê tudo
CREATE POLICY "upf_master_all" ON public.usuario_postos_fechamento
  FOR ALL TO authenticated
  USING    (get_user_role() = 'master')
  WITH CHECK (get_user_role() = 'master');

-- admin gerencia fechadores da própria empresa
CREATE POLICY "upf_admin_empresa" ON public.usuario_postos_fechamento
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    AND usuario_id IN (
      SELECT id FROM public.usuarios WHERE empresa_id = get_user_empresa_id()
    )
  )
  WITH CHECK (
    get_user_role() = 'admin'
    AND usuario_id IN (
      SELECT id FROM public.usuarios WHERE empresa_id = get_user_empresa_id()
    )
  );

-- fechador e operador vêem os próprios registros (para o select no app)
CREATE POLICY "upf_self_select" ON public.usuario_postos_fechamento
  FOR SELECT TO authenticated
  USING (usuario_id = auth.uid());

-- ─── 5. Atualizar policies do fechador em fechamentos_caixa ───────────────────
DROP POLICY IF EXISTS "fechamentos_fechador_select" ON public.fechamentos_caixa;
DROP POLICY IF EXISTS "fechamentos_fechador_insert" ON public.fechamentos_caixa;

CREATE POLICY "fechamentos_fechador_select"
  ON public.fechamentos_caixa FOR SELECT TO authenticated
  USING (
    get_user_role() = 'fechador'
    AND posto_id = ANY(get_user_postos_fechamento_ids())
  );

CREATE POLICY "fechamentos_fechador_insert"
  ON public.fechamentos_caixa FOR INSERT TO authenticated
  WITH CHECK (
    get_user_role() = 'fechador'
    AND posto_id = ANY(get_user_postos_fechamento_ids())
  );

-- ─── 6. Atualizar policies do fechador em fechamento_arquivos ─────────────────
DROP POLICY IF EXISTS "fech_arq_fechador_select" ON public.fechamento_arquivos;
DROP POLICY IF EXISTS "fech_arq_fechador_insert" ON public.fechamento_arquivos;

CREATE POLICY "fech_arq_fechador_select"
  ON public.fechamento_arquivos FOR SELECT TO authenticated
  USING (
    get_user_role() = 'fechador'
    AND fechamento_id IN (
      SELECT id FROM public.fechamentos_caixa
      WHERE posto_id = ANY(get_user_postos_fechamento_ids())
    )
  );

CREATE POLICY "fech_arq_fechador_insert"
  ON public.fechamento_arquivos FOR INSERT TO authenticated
  WITH CHECK (
    get_user_role() = 'fechador'
    AND fechamento_id IN (
      SELECT id FROM public.fechamentos_caixa
      WHERE posto_id = ANY(get_user_postos_fechamento_ids())
    )
  );

-- Nota: posto_fechamento_id na tabela usuarios permanece para operadores restritos (1 posto).
-- Para fechadores, a fonte de verdade agora é usuario_postos_fechamento.
