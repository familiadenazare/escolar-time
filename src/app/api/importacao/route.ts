import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'

import { importSupabase, type ImportPayload } from '@/lib/import-supabase'

export const maxDuration = 120

/**
 * TEMPORÁRIO: cópia única dos dados do Supabase. Só existe enquanto a variável
 * IMPORT_TOKEN estiver definida no Coolify; sai do código depois da migração.
 */
function authorized(request: NextRequest): boolean {
  const expected = process.env.IMPORT_TOKEN ?? ''
  const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (expected.length < 32 || given.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected))
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Esperado { tabela: linhas[] }.' }, { status: 400 })
  }
  try {
    return NextResponse.json(await importSupabase(body as ImportPayload))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 409 })
  }
}
