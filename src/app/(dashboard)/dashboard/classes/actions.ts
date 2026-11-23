'use server'

import { revalidatePath } from 'next/cache'
import { run } from '@/lib/db'
import { editorAction, type ActionResult } from '@/lib/actions'

type FormData = {
  school_unit_id: string
  name: string
  shift: 'MORNING' | 'AFTERNOON' | 'EVENING'
  year: number
  /** Professora regente (conduz as rotinas da turma); '' = nenhuma. */
  homeroom_teacher_id?: string
}

export async function createClass(data: FormData): Promise<ActionResult> {
  return editorAction(async (p) => {
    await run(
      p.id,
      `INSERT INTO class_groups (tenant_id, school_unit_id, name, shift, year, homeroom_teacher_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [p.tenant_id, data.school_unit_id, data.name, data.shift, data.year, data.homeroom_teacher_id || null],
    )
    revalidatePath('/dashboard/classes')
  })
}

export async function updateClass(id: string, data: FormData): Promise<ActionResult> {
  return editorAction(async (p) => {
    await run(
      p.id,
      `UPDATE class_groups
          SET school_unit_id = $1, name = $2, shift = $3, year = $4, homeroom_teacher_id = $5
        WHERE id = $6 AND tenant_id = $7`,
      [data.school_unit_id, data.name, data.shift, data.year, data.homeroom_teacher_id || null, id, p.tenant_id],
    )
    revalidatePath('/dashboard/classes')
  })
}

export async function toggleClassStatus(id: string): Promise<ActionResult> {
  return editorAction(async (p) => {
    const rows = await run(
      p.id,
      'UPDATE class_groups SET active = NOT active WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, p.tenant_id],
    )
    if (rows.length === 0) return { success: false, error: 'Turma não encontrada.' }
    revalidatePath('/dashboard/classes')
  })
}
