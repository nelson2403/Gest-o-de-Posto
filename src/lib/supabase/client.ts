import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Client com fluxo IMPLICIT (sem PKCE). Usado só para `resetPasswordForEmail`:
// assim o `{{ .TokenHash }}` do email vira um hash comum (não `pkce_...`), que o
// /auth/confirm consegue validar via verifyOtp em QUALQUER aparelho/navegador —
// sem depender do cookie code_verifier que o PKCE exige.
export function createImplicitClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { flowType: 'implicit' } }
  )
}
