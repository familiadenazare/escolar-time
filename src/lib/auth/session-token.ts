/**
 * Cookie de sessão do app (substitui a sessão do Supabase). Um JWT assinado com
 * SESSION_SECRET que guarda só o id do perfil. Usado pelo middleware (sem banco)
 * e por getSessionProfile (que confere no banco se o perfil continua ativo).
 * Só depende de `jose`, para rodar também no middleware.
 */
import { SignJWT, jwtVerify } from 'jose'

export const SESSION_COOKIE = 'et_session'
/** Estado do OAuth do Google (proteção contra CSRF no retorno). */
export const OAUTH_STATE_COOKIE = 'et_oauth_state'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 dias

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET
  if (!value || value.length < 32) {
    throw new Error('SESSION_SECRET ausente ou curta (mínimo 32 caracteres).')
  }
  return new TextEncoder().encode(value)
}

export async function createSessionToken(profileId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(profileId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret())
}

/** Id do perfil se o token for válido e não tiver expirado; senão null. */
export async function verifySessionToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] })
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_MAX_AGE,
}
