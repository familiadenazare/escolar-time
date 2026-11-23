import { NextResponse } from 'next/server'
import { requireEditor } from '@/lib/auth/api'
import { db, tx } from '@/lib/db'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireEditor()
  if (!auth.ok) return auth.response
  const { user } = auth

  const schedule = await db.one<{ id: string; status: string | null }>(
    'SELECT id, status FROM generated_schedules WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [id, user.tenant_id],
  )

  if (!schedule) {
    return NextResponse.json({ error: 'Horário não encontrado.' }, { status: 404 })
  }
  if (schedule.status !== 'COMPLETED') {
    return NextResponse.json(
      { error: 'Apenas horários concluídos podem ser usados como baseline.' },
      { status: 400 }
    )
  }

  // Baseline é exclusivo por tenant: desmarca o anterior e marca o novo juntos.
  try {
    await tx(user.id, async (q) => {
      await q.query(
        'UPDATE generated_schedules SET is_baseline = false WHERE tenant_id = $1 AND is_baseline AND id <> $2',
        [user.tenant_id, id],
      )
      await q.query('UPDATE generated_schedules SET is_baseline = true WHERE id = $1 AND tenant_id = $2', [
        id,
        user.tenant_id,
      ])
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
