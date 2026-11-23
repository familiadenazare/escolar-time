import { requireProfile } from '@/lib/auth/session'
import { listActiveUnits } from '@/lib/queries'
import { AssignmentsManager } from '@/components/assignments/assignments-manager'

export default async function AssignmentsPage() {
  const { tenant_id } = await requireProfile()
  const units = await listActiveUnits(tenant_id)
  return <AssignmentsManager units={units} />
}
