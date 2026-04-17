import { createServerClient, type CookieMethodsServer } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  const cookieMethods: CookieMethodsServer = {
    getAll() {
      return cookieStore.getAll()
    },
    setAll(cookiesToSet) {
      try {
        cookiesToSet.forEach(({ name, value, options }) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cookieStore.set(name, value, options as any)
        )
      } catch {
        // Chamado de Server Component — ignorar
      }
    },
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: cookieMethods }
  )
}
