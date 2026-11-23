import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'

import { importRobotReadings, robotPayloadSchema } from '@/lib/diaries/robot-import'

export const maxDuration = 60

/** O robô rpa-pedagogico se identifica com `Authorization: Bearer <ROBO_TOKEN>`. Esse token só grava leituras. */
function authorized(request: NextRequest): boolean {
  const expected = process.env.ROBO_TOKEN ?? ''
  const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (expected.length < 32 || given.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected))
}

/** Leituras dos diários de classe feitas pelo robô no Escolar Manager. */
export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const parsed = robotPayloadSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({ error: `Dados inválidos: ${issue?.path.join('.')} ${issue?.message}` }, { status: 400 })
  }

  try {
    return NextResponse.json(await importRobotReadings(parsed.data))
  } catch (e) {
    console.error('robo/diarios:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
