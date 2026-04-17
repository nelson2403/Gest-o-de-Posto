-- Migration 027: Role Fechador + Posto por Usuário + Edit/Delete + RLS atualizado

-- ─── 1. Adicionar 'fechador' ao CHECK de role ─────────────────────────────────
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_role_check;
ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_role_check
  CHECK (role IN ('master', 'admin', 'operador', 'conciliador', 'fechador'));

-- ─── 2. Coluna posto_fechamento_id em usuarios ────────────────────────────────
-- Utilizada por fechadores e operadores restritos a um único posto
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS posto_fechamento_id UUID REFERENCES public.postos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_usuarios_posto_fechamento ON public.usuarios(posto_fechamento_id);

-- ─── 3. Função helper para o posto do usuário logado ─────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_posto_fechamento_id()
RETURNS UUID AS $$
  SELECT posto_fechamento_id FROM public.usuarios WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─── 4. Atualizar policy admin_manage_operadores → incluir fechador ───────────
DROP POLICY IF EXISTS "admin_manage_operadores" ON public.usuarios;
CREATE POLICY "admin_manage_operadores" ON public.usuarios
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'admin'
    AND empresa_id = get_user_empresa_id()
    AND role IN ('operador', 'fechador')
  )
  WITH CHECK (
    get_user_role() = 'admin'
    AND empresa_id = get_user_empresa_id()
    AND role IN ('operador', 'fechador')
  );

-- ─── 5. Atualizar policy operador em fechamentos_caixa (respeita posto) ───────
DROP POLICY IF EXISTS "fechamentos_operador_all" ON public.fechamentos_caixa;
CREATE POLICY "fechamentos_operador_all"
  ON public.fechamentos_caixa FOR ALL TO authenticated
  USING (
    get_user_role() = 'operador'
    AND empresa_id = get_user_empresa_id()
    AND (
      get_user_posto_fechamento_id() IS NULL
      OR posto_id = get_user_posto_fechamento_id()
    )
  )
  WITH CHECK (
    get_user_role() = 'operador'
    AND empresa_id = get_user_empresa_id()
    AND (
      get_user_posto_fechamento_id() IS NULL
      OR posto_id = get_user_posto_fechamento_id()
    )
  );

-- ─── 6. Policies do fechador em fechamentos_caixa ────────────────────────────
-- Fechador só vê e cria fechamentos do seu posto (não atualiza nem deleta)
CREATE POLICY "fechamentos_fechador_select"
  ON public.fechamentos_caixa FOR SELECT TO authenticated
  USING (
    get_user_role() = 'fechador'
    AND posto_id = get_user_posto_fechamento_id()
  );

CREATE POLICY "fechamentos_fechador_insert"
  ON public.fechamentos_caixa FOR INSERT TO authenticated
  WITH CHECK (
    get_user_role() = 'fechador'
    AND posto_id = get_user_posto_fechamento_id()
  );

-- ─── 7. Atualizar policies operador em fechamento_arquivos ────────────────────
DROP POLICY IF EXISTS "fech_arq_empresa_select" ON public.fechamento_arquivos;
DROP POLICY IF EXISTS "fech_arq_empresa_insert" ON public.fechamento_arquivos;
DROP POLICY IF EXISTS "fech_arq_empresa_delete" ON public.fechamento_arquivos;

CREATE POLICY "fech_arq_empresa_select"
  ON public.fechamento_arquivos FOR SELECT TO authenticated
  USING (
    get_user_role() IN ('admin', 'operador', 'conciliador')
    AND fechamento_id IN (
      SELECT id FROM public.fechamentos_caixa
      WHERE empresa_id = get_user_empresa_id()
        AND (
          get_user_role() != 'operador'
          OR get_user_posto_fechamento_id() IS NULL
          OR posto_id = get_user_posto_fechamento_id()
        )
    )
  );

CREATE POLICY "fech_arq_empresa_insert"
  ON public.fechamento_arquivos FOR INSERT TO authenticated
  WITH CHECK (
    get_user_role() IN ('admin', 'operador')
    AND fechamento_id IN (
      SELECT id FROM public.fechamentos_caixa
      WHERE empresa_id = get_user_empresa_id()
        AND (
          get_user_role() != 'operador'
          OR get_user_posto_fechamento_id() IS NULL
          OR posto_id = get_user_posto_fechamento_id()
        )
    )
  );

CREATE POLICY "fech_arq_empresa_delete"
  ON public.fechamento_arquivos FOR DELETE TO authenticated
  USING (
    get_user_role() IN ('admin', 'operador')
    AND fechamento_id IN (
      SELECT id FROM public.fechamentos_caixa
      WHERE empresa_id = get_user_empresa_id()
        AND (
          get_user_role() != 'operador'
          OR get_user_posto_fechamento_id() IS NULL
          OR posto_id = get_user_posto_fechamento_id()
        )
    )
  );

-- ─── 8. Policies do fechador em fechamento_arquivos ──────────────────────────
CREATE POLICY "fech_arq_fechador_select"
  ON public.fechamento_arquivos FOR SELECT TO authenticated
  USING (
    get_user_role() = 'fechador'
    AND fechamento_id IN (
      SELECT id FROM public.fechamentos_caixa
      WHERE posto_id = get_user_posto_fechamento_id()
    )
  );

CREATE POLICY "fech_arq_fechador_insert"
  ON public.fechamento_arquivos FOR INSERT TO authenticated
  WITH CHECK (
    get_user_role() = 'fechador'
    AND fechamento_id IN (
      SELECT id FROM public.fechamentos_caixa
      WHERE posto_id = get_user_posto_fechamento_id()
    )
  );

-- ─── 9. Atualizar policies operador em fechamento_comentarios ─────────────────
DROP POLICY IF EXISTS "fech_com_empresa_select" ON public.fechamento_comentarios;
DROP POLICY IF EXISTS "fech_com_empresa_insert" ON public.fechamento_comentarios;

CREATE POLICY "fech_com_empresa_select"
  ON public.fechamento_comentarios FOR SELECT TO authenticated
  USING (
    get_user_role() IN ('admin', 'operador')
    AND fechamento_id IN (
      SELECT id FROM public.fechamentos_caixa
      WHERE empresa_id = get_user_empresa_id()
        AND (
          get_user_role() != 'operador'
          OR get_user_posto_fechamento_id() IS NULL
          OR posto_id = get_user_posto_fechamento_id()
        )
    )
  );

CREATE POLICY "fech_com_empresa_insert"
  ON public.fechamento_comentarios FOR INSERT TO authenticated
  WITH CHECK (
    get_user_role() IN ('admin', 'operador')
    AND fechamento_id IN (
      SELECT id FROM public.fechamentos_caixa
      WHERE empresa_id = get_user_empresa_id()
        AND (
          get_user_role() != 'operador'
          OR get_user_posto_fechamento_id() IS NULL
          OR posto_id = get_user_posto_fechamento_id()
        )
    )
  );

-- Nota: fechador NÃO tem policy em fechamento_comentarios
-- → fechadores apenas enviam documentos, sem acesso a comentários
