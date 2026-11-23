import { db } from '@/lib/db'
import { requireProfile } from '@/lib/auth/session'
import { UnitsTable } from '@/components/units/units-table'

export default async function UnitsPage() {
  const { tenant_id } = await requireProfile()
  const units = await db.query<{
    id: string
    name: string
    code: string
    address: string | null
    active: boolean
    created_at: string
  }>(
    'SELECT id, name, code, address, active, created_at FROM school_units WHERE tenant_id = $1 ORDER BY name',
    [tenant_id],
  )
  return <UnitsTable units={units} />
}
