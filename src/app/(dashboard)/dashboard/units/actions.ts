'use server'

import { revalidatePath } from 'next/cache'
import { run } from '@/lib/db'
import { editorAction, type ActionResult } from '@/lib/actions'

type FormData = {
  name: string
  code: string
  address?: string
}

const UNIQUE = { unique: 'Já existe uma unidade com esse código.' }

export async function createUnit(data: FormData): Promise<ActionResult> {
  return editorAction(async (p) => {
    await run(
      p.id,
      'INSERT INTO school_units (tenant_id, name, code, address) VALUES ($1, $2, $3, $4)',
      [p.tenant_id, data.name, data.code.toUpperCase(), data.address ?? null],
    )
    revalidatePath('/dashboard/units')
  }, UNIQUE)
}

export async function updateUnit(id: string, data: FormData): Promise<ActionResult> {
  return editorAction(async (p) => {
    await run(
      p.id,
      'UPDATE school_units SET name = $1, code = $2, address = $3 WHERE id = $4 AND tenant_id = $5',
      [data.name, data.code.toUpperCase(), data.address ?? null, id, p.tenant_id],
    )
    revalidatePath('/dashboard/units')
  }, UNIQUE)
}

export async function toggleUnitStatus(id: string): Promise<ActionResult> {
  return editorAction(async (p) => {
    const rows = await run(
      p.id,
      'UPDATE school_units SET active = NOT active WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, p.tenant_id],
    )
    if (rows.length === 0) return { success: false, error: 'Unidade não encontrada.' }
    revalidatePath('/dashboard/units')
  })
}
