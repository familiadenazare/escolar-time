import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getAdminProfile } from '@/lib/auth/session'
import { UsersTable } from '@/components/users/users-table'

export default async function UsersPage() {
  const admin = await getAdminProfile()
  if (!admin) redirect('/dashboard')

  const users = await db.query<{
    id: string
    name: string
    email: string
    role: string
    active: boolean
    created_at: string
    last_sign_in_at: string | null
  }>(
    `SELECT id, name, email, role, active, created_at, last_login_at AS last_sign_in_at
       FROM profiles WHERE tenant_id = $1 ORDER BY name`,
    [admin.tenant_id],
  )

  return <UsersTable users={users} currentUserId={admin.id} />
}
