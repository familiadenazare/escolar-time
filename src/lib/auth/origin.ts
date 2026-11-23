import type { NextRequest } from 'next/server'

/**
 * Endereço público do app. Atrás do proxy do Coolify `nextUrl.origin` é o
 * endereço interno (localhost:3000); o público vem dos cabeçalhos encaminhados.
 * APP_URL, se definida, vale acima de tudo (é o que está cadastrado no Google).
 */
export function publicOrigin(request: NextRequest): string {
  const fixed = process.env.APP_URL?.trim().replace(/\/$/, '')
  if (fixed) return fixed
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '')
  return host ? `${proto}://${host}` : request.nextUrl.origin
}
