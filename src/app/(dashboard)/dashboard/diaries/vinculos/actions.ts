'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { db, run } from '@/lib/db'
import { editorAction, type ActionResult } from '@/lib/actions'

const TABLE = { turma: 'class_groups', disciplina: 'subjects', professor: 'teachers' } as const

const schema = z.object({
  id: z.guid(),
  /** null = sem vínculo. */
  localId: z.guid().nullable(),
  ignored: z.boolean(),
})

/** Liga um nome do Escolar a um cadastro daqui (ou marca "não usar"). */
export async function setEmLink(input: z.infer<typeof schema>): Promise<ActionResult> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Dados inválidos.' }
  const { id, localId, ignored } = parsed.data

  return editorAction(async (p) => {
    const link = await db.one<{ kind: keyof typeof TABLE }>('SELECT kind FROM em_links WHERE id = $1 AND tenant_id = $2', [
      id,
      p.tenant_id,
    ])
    if (!link) return { success: false, error: 'Vínculo não encontrado.' }

    if (localId) {
      const exists = await db.one(`SELECT 1 FROM ${TABLE[link.kind]} WHERE id = $1 AND tenant_id = $2`, [localId, p.tenant_id])
      if (!exists) return { success: false, error: 'Cadastro não encontrado.' }
    }

    await run(p.id, 'UPDATE em_links SET local_id = $1, ignored = $2, auto = false WHERE id = $3 AND tenant_id = $4', [
      ignored ? null : localId,
      ignored,
      id,
      p.tenant_id,
    ])
    revalidatePath('/dashboard/diaries/vinculos')
    revalidatePath('/dashboard/diaries')
  })
}
