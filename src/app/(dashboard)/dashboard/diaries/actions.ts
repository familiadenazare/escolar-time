'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { bulkValues, run } from '@/lib/db'
import { editorAction, type ActionResult } from '@/lib/actions'
import { DIARY_STATUSES } from '@/lib/diaries/status'

const PATH = '/dashboard/diaries'

const keySchema = z.object({
  classGroupId: z.guid(),
  teacherId: z.guid(),
  subjectId: z.guid().nullable(),
})

const cellSchema = keySchema.extend({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  status: z.enum(DIARY_STATUSES).nullable(),
  notes: z.string().trim().max(500).nullable(),
})

export type DiaryCellInput = z.infer<typeof cellSchema>

const INVALID: ActionResult = { success: false, error: 'Dados inválidos.' }

/** Marca (ou limpa, com status nulo) a situação de um diário no mês. */
export async function setDiaryCell(input: DiaryCellInput): Promise<ActionResult> {
  const parsed = cellSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const c = parsed.data

  return editorAction(async (p) => {
    if (c.status === null) {
      await run(
        p.id,
        `DELETE FROM diary_checks
          WHERE tenant_id = $1 AND class_group_id = $2 AND teacher_id = $3
            AND subject_id IS NOT DISTINCT FROM $4 AND year = $5 AND month = $6`,
        [p.tenant_id, c.classGroupId, c.teacherId, c.subjectId, c.year, c.month],
      )
    } else {
      await run(
        p.id,
        `INSERT INTO diary_checks (tenant_id, class_group_id, teacher_id, subject_id, year, month, status, notes, checked_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT ON CONSTRAINT diary_checks_unique
         DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, checked_by = EXCLUDED.checked_by`,
        [p.tenant_id, c.classGroupId, c.teacherId, c.subjectId, c.year, c.month, c.status, c.notes || null, p.id],
      )
    }
    revalidatePath(PATH)
  })
}

const bulkSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  status: z.enum(DIARY_STATUSES),
  rows: z.array(keySchema).min(1).max(2000),
})

/** Mesma situação para vários diários de um mês (ex.: julho = férias). */
export async function bulkSetDiaryCells(input: z.infer<typeof bulkSchema>): Promise<ActionResult> {
  const parsed = bulkSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const { year, month, status, rows } = parsed.data

  return editorAction(async (p) => {
    const { values, params } = bulkValues(
      rows.map((r) => [p.tenant_id, r.classGroupId, r.teacherId, r.subjectId, year, month, status, p.id]),
    )
    await run(
      p.id,
      `INSERT INTO diary_checks (tenant_id, class_group_id, teacher_id, subject_id, year, month, status, checked_by)
       VALUES ${values}
       ON CONFLICT ON CONSTRAINT diary_checks_unique
       DO UPDATE SET status = EXCLUDED.status, checked_by = EXCLUDED.checked_by`,
      params,
    )
    revalidatePath(PATH)
  })
}

const extraSchema = keySchema.extend({
  year: z.number().int().min(2000).max(2100),
  notes: z.string().trim().max(200).nullable(),
})

/** Acrescenta um diário que não está nas Atribuições (ex.: substituto). */
export async function addExtraRow(input: z.infer<typeof extraSchema>): Promise<ActionResult & { id?: string }> {
  const parsed = extraSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const r = parsed.data

  let id: string | undefined
  const result = await editorAction(
    async (p) => {
      const [row] = await run<{ id: string }>(
        p.id,
        `INSERT INTO diary_extra_rows (tenant_id, class_group_id, teacher_id, subject_id, year, notes)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [p.tenant_id, r.classGroupId, r.teacherId, r.subjectId, r.year, r.notes || null],
      )
      id = row.id
      revalidatePath(PATH)
    },
    { unique: 'Esse diário já está na lista.' },
  )
  return result.success ? { ...result, id } : result
}

/** Tira da lista uma linha acrescentada à mão (as verificações já feitas ficam). */
export async function removeExtraRow(id: string): Promise<ActionResult> {
  if (!z.guid().safeParse(id).success) return INVALID
  return editorAction(async (p) => {
    await run(p.id, 'DELETE FROM diary_extra_rows WHERE id = $1 AND tenant_id = $2', [id, p.tenant_id])
    revalidatePath(PATH)
  })
}
