import { NextResponse, type NextRequest } from 'next/server'

import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session-token'

// Só confere se o cookie de sessão é válido (sem banco). Se o perfil continua
// ativo é conferido no layout do painel (getSessionProfile).
export async function middleware(request: NextRequest) {
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
