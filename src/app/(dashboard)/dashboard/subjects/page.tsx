import { db } from '@/lib/db'
import { requireProfile } from '@/lib/auth/session'
import { SubjectsTable } from '@/components/subjects/subjects-table'

export default async function SubjectsPage() {
  const { tenant_id } = await requireProfile()
  const subjects = await db.query<{ id: string; name: string; code: string; color: string; active: boolean }>(
    'SELECT id, name, code, color, active FROM subjects WHERE tenant_id = $1 ORDER BY name',
    [tenant_id],
  )
  return <SubjectsTable subjects={subjects} />
}
