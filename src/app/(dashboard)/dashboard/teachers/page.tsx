import { db } from '@/lib/db'
import { requireProfile } from '@/lib/auth/session'
import { TeachersTable } from '@/components/teachers/teachers-table'

export default async function TeachersPage() {
  const { tenant_id } = await requireProfile()
  const teachers = await db.query<{ id: string; name: string; active: boolean }>(
    'SELECT id, name, active FROM teachers WHERE tenant_id = $1 ORDER BY name',
    [tenant_id],
  )
  return <TeachersTable teachers={teachers} />
}
