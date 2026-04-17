-- ============================================================
-- MIGRATION 003: VIEW PARA DASHBOARD
-- ============================================================

CREATE OR REPLACE VIEW public.vw_dashboard_empresa AS
SELECT
    e.id                                              AS empresa_id,
    e.nome                                            AS empresa_nome,
    COUNT(DISTINCT p.id)                              AS total_postos,
    COUNT(DISTINCT m.id)                              AS total_maquininhas,
    COUNT(DISTINCT m.id) FILTER (WHERE m.status = 'ativo')     AS maquininhas_ativas,
    COUNT(DISTINCT m.id) FILTER (WHERE m.status = 'inativo')   AS maquininhas_inativas,
    COUNT(DISTINCT m.id) FILTER (WHERE m.status = 'manutencao') AS maquininhas_manutencao,
    COUNT(DISTINCT u.id)                              AS total_usuarios,
    COUNT(DISTINCT ad.id)                             AS total_adquirentes
FROM public.empresas e
LEFT JOIN public.postos p        ON p.empresa_id = e.id AND p.ativo = TRUE
LEFT JOIN public.maquininhas m   ON m.posto_id = p.id
LEFT JOIN public.usuarios u      ON u.empresa_id = e.id AND u.ativo = TRUE
LEFT JOIN public.adquirentes ad  ON ad.empresa_id = e.id AND ad.ativo = TRUE
GROUP BY e.id, e.nome;

-- Permitir acesso via RLS
ALTER VIEW public.vw_dashboard_empresa OWNER TO postgres;
