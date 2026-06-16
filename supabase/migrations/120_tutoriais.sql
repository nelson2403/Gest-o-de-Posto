-- Vídeos tutoriais de uso do sistema. Todos os perfis assistem; só o master
-- insere/remove (upload de mp4 no storage). O bucket "tutoriais" é criado à parte.

CREATE TABLE IF NOT EXISTS tutoriais (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo       text NOT NULL,
  descricao    text,
  arquivo_path text NOT NULL,
  arquivo_nome text,
  ordem        int  NOT NULL DEFAULT 0,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  criado_por   uuid
);

ALTER TABLE tutoriais ENABLE ROW LEVEL SECURITY;

-- Leitura para qualquer usuário autenticado; escrita só via service role (API).
DROP POLICY IF EXISTS tutoriais_select ON tutoriais;
CREATE POLICY tutoriais_select ON tutoriais FOR SELECT TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';
