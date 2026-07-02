-- ─────────────────────────────────────────────────────────────────────────────
-- 141_comissionamento_metas_grupo_cascade.sql
--
-- Muda o comportamento ao excluir um grupo de metas.
--
-- Antes (migration 082): FK comissio_metas.grupo_id era ON DELETE SET NULL.
-- Excluir um grupo deixava as metas ÓRFÃS (grupo_id=null), sem organização
-- e virando poluição visual/report.
--
-- Agora: ON DELETE CASCADE — excluir o grupo remove todas as metas dele.
-- Cascata continua: metas com FK CASCADE removem splits automaticamente
-- (migration 082 já definia isso em comissio_metas_splits.meta_id).
--
-- O endpoint DELETE do grupo passa também a mostrar na resposta quantas
-- metas foram removidas (não faz mais sentido separar).
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop da constraint atual — o Postgres nomeia automaticamente inline FKs
-- como <table>_<coluna>_fkey. Se por algum motivo tiver outro nome, o
-- DROP IF EXISTS não quebra e o próximo ALTER cria com o mesmo padrão.
ALTER TABLE public.comissio_metas
  DROP CONSTRAINT IF EXISTS comissio_metas_grupo_id_fkey;

ALTER TABLE public.comissio_metas
  ADD CONSTRAINT comissio_metas_grupo_id_fkey
    FOREIGN KEY (grupo_id)
    REFERENCES public.comissio_metas_grupos(id)
    ON DELETE CASCADE;
