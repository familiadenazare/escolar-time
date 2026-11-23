'use server'

import { revalidatePath } from 'next/cache'
import { run } from '@/lib/db'
import { editorAction, type ActionResult } from '@/lib/actions'

type FormData = {
  name: string
}

export async function createTeacher(data: FormData): Promise<ActionResult> {
  return editorAction(async (p) => {
    await run(p.id, 'INSERT INTO teachers (tenant_id, name) VALUES ($1, $2)', [p.tenant_id, data.name])
    revalidatePath('/dashboard/teachers')
  })
}

export async function updateTeacher(id: string, data: FormData): Promise<ActionResult> {
  return editorAction(async (p) => {
    await run(p.id, 'UPDATE teachers SET name = $1 WHERE id = $2 AND tenant_id = $3', [data.name, id, p.tenant_id])
    revalidatePath('/dashboard/teachers')
  })
}

export async function toggleTeacherStatus(id: string): Promise<ActionResult> {
  return editorAction(async (p) => {
    const rows = await run(
      p.id,
      'UPDATE teachers SET active = NOT active WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, p.tenant_id],
    )
    if (rows.length === 0) return { success: false, error: 'Professor não encontrado.' }
    revalidatePath('/dashboard/teachers')
  })
}
