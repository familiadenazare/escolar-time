'use server'

import { revalidatePath } from 'next/cache'
import { run } from '@/lib/db'
import { editorAction, type ActionResult } from '@/lib/actions'

type FormData = {
  name: string
  code: string
  color: string
  active?: boolean
}

export async function createSubject(data: FormData): Promise<ActionResult> {
  return editorAction(async (p) => {
    await run(
      p.id,
      'INSERT INTO subjects (tenant_id, name, code, color, active) VALUES ($1, $2, $3, $4, $5)',
      [p.tenant_id, data.name, data.code.toUpperCase(), data.color, data.active ?? true],
    )
    revalidatePath('/dashboard/subjects')
  })
}

export async function updateSubject(id: string, data: FormData): Promise<ActionResult> {
  return editorAction(async (p) => {
    await run(
      p.id,
      'UPDATE subjects SET name = $1, code = $2, color = $3, active = $4 WHERE id = $5 AND tenant_id = $6',
      [data.name, data.code.toUpperCase(), data.color, data.active ?? true, id, p.tenant_id],
    )
    revalidatePath('/dashboard/subjects')
  })
}

export async function toggleSubjectStatus(id: string): Promise<ActionResult> {
  return editorAction(async (p) => {
    const rows = await run(
      p.id,
      'UPDATE subjects SET active = NOT active WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, p.tenant_id],
    )
    if (rows.length === 0) return { success: false, error: 'Disciplina não encontrada.' }
    revalidatePath('/dashboard/subjects')
  })
}
