import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getAdminProfile } from '@/lib/auth/session'
import { AREA_LABELS, type AuditEntry } from '@/lib/audit-labels'
import { HistoryView } from '@/components/history/history-view'

const PAGE_SIZE = 200
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; area?: string; page?: string }>
}) {
  const admin = await getAdminProfile()
  if (!admin) redirect('/dashboard')

  const params = await searchParams
  const user = params.user === 'system' || UUID_RE.test(params.user ?? '') ? params.user! : ''
  const area = params.area && params.area in AREA_LABELS ? params.area : ''
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1)

  const conditions = ['tenant_id = $1']
  const values: unknown[] = [admin.tenant_id]
  if (user === 'system') {
    conditions.push('actor_id IS NULL')
  } else if (user) {
    values.push(user)
    conditions.push(`actor_id = $${values.length}`)
  }
  if (area) {
    values.push(area)
    conditions.push(`table_name = $${values.length}`)
  }
  // Um a mais para saber se há página seguinte.
  values.push(PAGE_SIZE + 1, (page - 1) * PAGE_SIZE)

  const [{ entries, error }, profiles] = await Promise.all([
    db
      .query<AuditEntry>(
        `SELECT id, occurred_at, actor_id, actor_name, actor_email, action, table_name, record_id,
                record_label, changed_fields, old_data, new_data
           FROM audit_log
          WHERE ${conditions.join(' AND ')}
          ORDER BY occurred_at DESC, id DESC
          LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      )
      .then(
        (rows) => ({ entries: rows, error: null as string | null }),
        (e: unknown) => ({ entries: [] as AuditEntry[], error: e instanceof Error ? e.message : String(e) }),
      ),
    db.query<{ id: string; name: string }>('SELECT id, name FROM profiles WHERE tenant_id = $1 ORDER BY name', [
      admin.tenant_id,
    ]),
  ])

  const hasMore = entries.length > PAGE_SIZE

  return (
    <HistoryView
      entries={entries.slice(0, PAGE_SIZE)}
      users={profiles}
      filters={{ user, area }}
      page={page}
      hasMore={hasMore}
      error={error}
    />
  )
}
