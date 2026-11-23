import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { requireProfile } from '@/lib/auth/session'
import { LinksManager, type EmLinkRow } from '@/components/diaries/links-manager'

export const metadata: Metadata = { title: 'Vínculos com o Escolar' }

export default async function EmLinksPage() {
  const { tenant_id } = await requireProfile()

  const [links, classes, subjects, teachers] = await Promise.all([
    db.query<EmLinkRow>(
      `SELECT l.id, l.kind, l.em_key AS "emKey", l.name, l.local_id AS "localId", l.ignored, l.auto,
              (SELECT count(*)::int FROM diary_readings r
                WHERE r.tenant_id = l.tenant_id
                  AND ((l.kind = 'turma' AND r.em_turma_key = l.em_key)
                    OR (l.kind = 'disciplina' AND r.em_disciplina_key = l.em_key)
                    OR (l.kind = 'professor' AND r.em_professor_key = l.em_key))) AS readings
         FROM em_links l
        WHERE l.tenant_id = $1
        ORDER BY (l.local_id IS NULL AND NOT l.ignored) DESC, l.kind, l.name`,
      [tenant_id],
    ),
    db.query<{ id: string; name: string; year: number }>(
      'SELECT id, name, year FROM class_groups WHERE tenant_id = $1 AND active ORDER BY year DESC, name',
      [tenant_id],
    ),
    db.query<{ id: string; name: string }>('SELECT id, name FROM subjects WHERE tenant_id = $1 AND active ORDER BY name', [
      tenant_id,
    ]),
    db.query<{ id: string; name: string }>('SELECT id, name FROM teachers WHERE tenant_id = $1 AND active ORDER BY name', [
      tenant_id,
    ]),
  ])

  return (
    <LinksManager
      links={links}
      options={{
        turma: classes.map((c) => ({ id: c.id, name: `${c.name} (${c.year})` })),
        disciplina: subjects,
        professor: teachers,
      }}
    />
  )
}
