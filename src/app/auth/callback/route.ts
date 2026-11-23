import { NextResponse, type NextRequest } from 'next/server'

import { resolveLogin } from '@/lib/auth/login'
import { publicOrigin } from '@/lib/auth/origin'
import {
  createSessionToken,
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '@/lib/auth/session-token'

type IdTokenClaims = {
  iss?: string
  aud?: string
  email?: string
  email_verified?: boolean
  name?: string
  exp?: number
}

function decodeIdToken(idToken: string): IdTokenClaims | null {
  try {
    const payload = idToken.split('.')[1]
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as IdTokenClaims
  } catch {
    return null
  }
}

// Volta do Google: troca o `code` pelo id_token e abre a sessão do app.
// O id_token vem direto do endpoint de token do Google, por TLS e autenticado
// com o client secret — por isso basta conferir emissor, público e validade
// (OpenID Connect Core, 3.1.3.7).
export async function GET(request: NextRequest) {
  const origin = publicOrigin(request)
  const fail = (reason: string) => {
    const res = NextResponse.redirect(`${origin}/login?error=${reason}`)
    res.cookies.delete({ name: OAUTH_STATE_COOKIE, path: '/auth' })
    return res
  }

  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const expected = request.cookies.get(OAUTH_STATE_COOKIE)?.value
  if (!code || !state || !expected || state !== expected) return fail('oauth')

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return fail('oauth')

  let claims: IdTokenClaims | null = null
  try {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${origin}/auth/callback`,
        grant_type: 'authorization_code',
      }),
    })
    if (!resp.ok) return fail('oauth')
    const data = (await resp.json()) as { id_token?: string }
    claims = data.id_token ? decodeIdToken(data.id_token) : null
  } catch {
    return fail('oauth')
  }

  const validIssuer = claims?.iss === 'https://accounts.google.com' || claims?.iss === 'accounts.google.com'
  const notExpired = (claims?.exp ?? 0) * 1000 > Date.now()
  if (!claims || !validIssuer || claims.aud !== clientId || !notExpired || !claims.email || !claims.email_verified) {
    return fail('oauth')
  }

  const outcome = await resolveLogin(claims.email, claims.name ?? null)
  if (!outcome.ok) return fail(outcome.reason)

  const res = NextResponse.redirect(`${origin}/dashboard`)
  res.cookies.delete({ name: OAUTH_STATE_COOKIE, path: '/auth' })
  res.cookies.set(SESSION_COOKIE, await createSessionToken(outcome.profileId), sessionCookieOptions)
  return res
}
