'use server'

import { revalidatePath } from 'next/cache'
import { run } from '@/lib/db'
import { editorAction, type ActionResult } from '@/lib/actions'

type ConstraintType =
  | 'UNAVAILABLE_SLOT'
  | 'UNAVAILABLE_PERIOD'
  | 'MUST_START_AFTER'
  | 'MUST_END_BEFORE'
  | 'MAX_CONSECUTIVE'
  | 'MIN_GAP_BETWEEN_UNITS'
  | 'PREFER_SINGLE_UNIT_DAY'
  | 'MAX_LESSONS_PER_DAY'
  | 'NO_IDLE_GAPS'
  | 'PREFER_CONSECUTIVE'
  | 'FIXED_DAY'
  | 'AVOID_DAY'
  | 'CUSTOM'

type CreateConstraintData = {
  teacher_id: string
  type: ConstraintType
  priority: 'MANDATORY' | 'PREFERRED'
  days_of_week: number[]
  school_unit_id?: string | null
  subject_id?: string | null
  time_from?: string | null
  time_to?: string | null
  slot_order?: number | null
  min_gap_slots?: number | null
  value?: Record<string, unknown> | null
  description?: string | null
}

export async function createConstraint(data: CreateConstraintData): Promise<ActionResult> {
  return editorAction(async (p) => {
    await run(
      p.id,
      `INSERT INTO teacher_constraints
         (tenant_id, teacher_id, type, priority, days_of_week, school_unit_id, subject_id,
          time_from, time_to, slot_order, min_gap_slots, value, description, active)
       VALUES ($1, $2, $3, $4, $5::int[], $6, $7, $8, $9, $10, $11, $12::jsonb, $13, true)`,
      [
        p.tenant_id,
        data.teacher_id,
        data.type,
        data.priority,
        data.days_of_week,
        data.school_unit_id ?? null,
        data.subject_id ?? null,
        data.time_from ?? null,
        data.time_to ?? null,
        data.slot_order ?? null,
        data.min_gap_slots ?? null,
        data.value == null ? null : JSON.stringify(data.value),
        data.description ?? null,
      ],
    )
    revalidatePath('/dashboard/constraints')
  })
}

export async function toggleConstraintStatus(id: string): Promise<ActionResult> {
  return editorAction(async (p) => {
    const rows = await run(
      p.id,
      'UPDATE teacher_constraints SET active = NOT active WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, p.tenant_id],
    )
    if (rows.length === 0) return { success: false, error: 'Restrição não encontrada.' }
    revalidatePath('/dashboard/constraints')
  })
}

export async function deleteConstraint(id: string): Promise<ActionResult> {
  return editorAction(async (p) => {
    await run(p.id, 'DELETE FROM teacher_constraints WHERE id = $1 AND tenant_id = $2', [id, p.tenant_id])
    revalidatePath('/dashboard/constraints')
  })
}
