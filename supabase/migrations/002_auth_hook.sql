-- ============================================================
-- MIGRATION 002: AUTH HOOK — Custom JWT Claims
-- Adiciona role e empresa_id no token JWT
-- Configurar no Supabase Dashboard > Auth > Hooks
-- ============================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB AS $$
DECLARE
    claims     JSONB;
    v_role     TEXT;
    v_empresa  UUID;
BEGIN
    SELECT role, empresa_id
    INTO v_role, v_empresa
    FROM public.usuarios
    WHERE id = (event->>'user_id')::UUID;

    claims := event->'claims';

    IF v_role IS NOT NULL THEN
        claims := jsonb_set(claims, '{user_role}', to_jsonb(v_role));
    END IF;

    IF v_empresa IS NOT NULL THEN
        claims := jsonb_set(claims, '{user_empresa_id}', to_jsonb(v_empresa::TEXT));
    END IF;

    RETURN jsonb_set(event, '{claims}', claims);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
