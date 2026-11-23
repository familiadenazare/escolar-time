import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireEditor } from '@/lib/auth/api'
import { db, type Queryable } from '@/lib/db'

export const lessonsSchema = z
  .array(
    z.object({
      assignmentId: z.string().min(1),
      day: z.number().int().min(0).max(6),
      slotId: z.string().min(1),
    })
  )
  .min(1, 'O horário não tem aulas.')
  .max(10000)

export type EditableSchedule = {
  id: string
  name: string
  is_baseline: boolean
  baseline_weight: number
  config_snapshot: { baselineScheduleId?: string | null; [k: string]: unknown } | null
}

type Ok<T> = { ok: true } & T
type Fail = { ok: false; response: NextResponse }

/** Usuário que pode editar (ADMIN/COORDINATOR) + horário editável (concluído e não apagado) do tenant. */
export async function loadEditableSchedule(
  id: string
): Promise<Ok<{ userId: string; tenantId: string; schedule: EditableSchedule }> | Fail> {
  const auth = await requireEditor()
  if (!auth.ok) return auth
  const { user } = auth

  const schedule = await db.one<EditableSchedule & { status: string | null; deleted_at: string | null }>(
    `SELECT id, name, status, is_baseline, baseline_weight, config_snapshot, deleted_at
       FROM generated_schedules WHERE id = $1 AND tenant_id = $2`,
    [id, user.tenant_id],
  )

  if (!schedule || schedule.deleted_at) {
    return { ok: false, response: NextResponse.json({ error: 'Horário não encontrado.' }, { status: 404 }) }
  }
  if (schedule.status !== 'COMPLETED') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Só horários concluídos podem ser editados.' }, { status: 400 }),
    }
  }

  return { ok: true, userId: user.id, tenantId: user.tenant_id, schedule }
}

export async function parseJson(request: Request): Promise<unknown | undefined> {
  try {
    return await request.json()
  } catch {
    return undefined
  }
}

export function badRequest(error: z.ZodError | string) {
  const message = typeof error === 'string' ? error : (error.issues[0]?.message ?? 'Body inválido.')
  return NextResponse.json({ error: message }, { status: 400 })
}

/**
 * Vigência das grades usadas pelo horário. Horários novos a gravam no config_snapshot;
 * nos antigos ela é deduzida pela grade de um dos slots usados. undefined = desconhecida
 * (o motor usa então a vigência mais recente de cada turma).
 */
export async function scheduleVigencia(
  schedule: EditableSchedule
): Promise<string | null | undefined> {
  const snap = schedule.config_snapshot
  if (snap && 'vigencia' in snap) return (snap.vigencia as string | null) ?? null

  const grid = await db.one<{ vigencia: string | null }>(
    `SELECT g.vigencia
       FROM schedule_entries e
       JOIN time_slots ts ON ts.id = e.time_slot_id
       JOIN time_grids g ON g.id = ts.time_grid_id
      WHERE e.generated_schedule_id = $1
      LIMIT 1`,
    [schedule.id],
  )
  return grid ? (grid.vigencia ?? null) : undefined
}

/** Grava as aulas de um horário (milhares de linhas: arrays em vez de um VALUES gigante). */
export async function insertScheduleEntries(
  q: Queryable,
  scheduleId: string,
  entries: { assignmentId: string; day: number; slotId: string }[],
) {
  if (entries.length === 0) return
  await q.query(
    `INSERT INTO schedule_entries (generated_schedule_id, teaching_assignment_id, day_of_week, time_slot_id, locked)
     SELECT $1, a, d, s, false FROM unnest($2::uuid[], $3::int[], $4::uuid[]) AS t(a, d, s)`,
    [scheduleId, entries.map((e) => e.assignmentId), entries.map((e) => e.day), entries.map((e) => e.slotId)],
  )
}
