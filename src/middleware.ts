import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabaseResponse.cookies.set(name, value, options as any)
          )
        },
      },
    }
  )

  const { pathname } = request.nextUrl
  // Rotas públicas: apenas endpoints que PRECISAM funcionar sem sessão Supabase.
  // /api/caixa/login e /api/caixa/setup-pin usam auth própria (PIN hash).
  // Os demais endpoints /api/caixa/* têm validarSessao() interno, mas precisam
  // do prefixo aqui porque o app de caixa não envia cookies Supabase.
  const publicRoutes = [
    '/login',
    '/auth/callback',
    '/api/cron/',
    '/api/caixa/login',
    '/api/caixa/setup-pin',
    '/api/caixa/dados',
    '/api/caixa/salvar',
    '/api/caixa/config',
    '/api/caixa/frentistas',
    '/caixa',
  ]
  const publicFiles  = ['/manifest.json', '/robots.txt', '/sitemap.xml']
  const isPublic = publicRoutes.some((r) => pathname.startsWith(r)) || publicFiles.includes(pathname)

  // IMPORTANTE: usar `getUser()` (não `getSession()`) — ele valida o JWT com
  // o servidor do Supabase e, quando o access_token expirou, executa o
  // refresh usando o refresh_token e reescreve os cookies via o callback
  // `setAll` acima. Sem isso, a sessão "vence em silêncio" e o front
  // continua navegando, mas as APIs retornam 401.
  let user = null
  try {
    const getUserWithTimeout = Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ])
    const { data } = await getUserWithTimeout as Awaited<ReturnType<typeof supabase.auth.getUser>>
    user = data.user ?? null
  } catch {
    // Supabase indisponível ou timeout
    // Para APIs protegidas: retorna 503 para evitar exposição de dados
    // Para páginas públicas: permite passar
    if (pathname.startsWith('/api/') && !isPublic) {
      return NextResponse.json({ error: 'Serviço indisponível' }, { status: 503 })
    }
    return supabaseResponse
  }

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value)
    })
    return redirectResponse
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value)
    })
    return redirectResponse
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
