import { NextResponse, type NextRequest } from 'next/server'

import { publicOrigin } from '@/lib/auth/origin'
import { SESSION_COOKIE } from '@/lib/auth/session-token'

// Encerra a sessão e volta ao login (também usado quando o perfil foi desativado).
export async function GET(request: NextRequest) {
  const reason = request.nextUrl.searchParams.get('error')
  const query = reason === 'inactive' ? '?error=inactive' : ''
  const res = NextResponse.redirect(`${publicOrigin(request)}/login${query}`)
  res.cookies.delete(SESSION_COOKIE)
  return res
}
