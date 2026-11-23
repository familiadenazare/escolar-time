import { NextResponse, type NextRequest } from 'next/server'

import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session-token'

// Endereço antigo do programa de horários: tudo vai para o Pedagógico, no mesmo caminho.
const LEGACY_HOSTS = new Set(['horarios.familiadenazare.com.br'])
const CANONICAL_ORIGIN = 'https://pedagogico.familiadenazare.com.br'

export function legacyRedirect(host: string | null, pathname: string, search: string): string | null {
  const h = (host ?? '').split(':')[0].toLowerCase()
  return LEGACY_HOSTS.has(h) ? `${CANONICAL_ORIGIN}${pathname}${search}` : null
}

// Só confere se o cookie de sessão é válido (sem banco). Se o perfil continua
// ativo é conferido no layout do painel (getSessionProfile).
export async function middleware(request: NextRequest) {
  const legacy = legacyRedirect(
    request.headers.get('x-forwarded-host') ?? request.headers.get('host'),
    request.nextUrl.pathname,
    request.nextUrl.search,
  )
  if (legacy) return NextResponse.redirect(legacy, 308)

  const loggedIn = (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) !== null
  const { pathname } = request.nextUrl

  if (!loggedIn && pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  if (loggedIn && (pathname === '/login' || pathname === '/')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
