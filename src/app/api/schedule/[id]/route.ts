import { NextResponse } from 'next/server'
import { requireEditor } from '@/lib/auth/api'
import { run } from '@/lib/db'

/**
 * Exclusão lógica: o horário some da listagem, mas fica no histórico de apagados
 * (com as aulas preservadas) registrando quem apagou e quando.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = await requireEditor()
  if (!auth.ok) return auth.response
  const { user } = auth

  try {
    const rows = await run(
      user.id,
      `UPDATE generated_schedules
          SET deleted_at = now(), deleted_by = $1, deleted_reason = 'manual', is_baseline = false
        WHERE id = $2 AND tenant_id = $3 AND deleted_at IS NULL
        RETURNING id`,
      [user.id, id, user.tenant_id],
    )
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Horário não encontrado.' }, { status: 404 })
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
