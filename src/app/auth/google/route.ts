import { NextResponse, type NextRequest } from 'next/server'

import { ALLOWED_EMAIL_DOMAIN } from '@/lib/auth/allowed-domain'
import { publicOrigin } from '@/lib/auth/origin'
import { OAUTH_STATE_COOKIE } from '@/lib/auth/session-token'

// Início do login com Google (OpenID Connect, fluxo authorization code).
export async function GET(request: NextRequest) {
  const origin = publicOrigin(request)
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) return NextResponse.redirect(`${origin}/login?error=oauth`)

  const state = crypto.randomUUID()
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/auth/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    // `hd` só filtra o seletor de contas; o domínio é validado no callback.
    hd: ALLOWED_EMAIL_DOMAIN,
    prompt: 'select_account',
  }).toString()

  const res = NextResponse.redirect(url)
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/auth',
    maxAge: 600,
  })
  return res
}
