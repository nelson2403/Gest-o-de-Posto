-- ─────────────────────────────────────────────────────────────────────────────
-- 032: Adiciona ON DELETE CASCADE na FK taxas.adquirente_id
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.taxas
  DROP CONSTRAINT IF EXISTS taxas_adquirente_id_fkey;

ALTER TABLE public.taxas
  ADD CONSTRAINT taxas_adquirente_id_fkey
    FOREIGN KEY (adquirente_id)
    REFERENCES public.adquirentes(id)
    ON DELETE CASCADE;
