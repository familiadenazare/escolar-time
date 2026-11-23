import { NextResponse, type NextRequest } from 'next/server'

import { resolveLogin } from '@/lib/auth/login'
import { publicOrigin } from '@/lib/auth/origin'
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session-token'

/**
 * Login de desenvolvimento, sem Google: /auth/dev?email=fulano@familiadenazare.com.br
 * Só existe com DEV_LOGIN=1 e fora de produção.
 */
export async function GET(request: NextRequest) {
  if (process.env.DEV_LOGIN !== '1' || process.env.NODE_ENV === 'production') {
    return new NextResponse('Não encontrado', { status: 404 })
  }
  const origin = publicOrigin(request)
  const email = request.nextUrl.searchParams.get('email') ?? ''
  const outcome = await resolveLogin(email, null)
  if (!outcome.ok) return NextResponse.redirect(`${origin}/login?error=${outcome.reason}`)

  const res = NextResponse.redirect(`${origin}/dashboard`)
  res.cookies.set(SESSION_COOKIE, await createSessionToken(outcome.profileId), sessionCookieOptions)
  return res
}
