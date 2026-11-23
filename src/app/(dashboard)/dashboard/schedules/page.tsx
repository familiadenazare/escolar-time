import { db } from '@/lib/db'
import { requireProfile } from '@/lib/auth/session'
import { SchedulesHistory } from '@/components/schedule/schedules-history'

export default async function SchedulesPage() {
  const { tenant_id } = await requireProfile()

  const [schedules, deleted] = await Promise.all([
    db.query(
      `SELECT g.id, g.name, g.created_at, g.status, g.score, g.is_baseline, g.violations, g.created_by,
              CASE WHEN p.id IS NULL THEN NULL ELSE json_build_object('id', p.id, 'name', p.name) END AS profiles
         FROM generated_schedules g
         LEFT JOIN profiles p ON p.id = g.created_by
        WHERE g.tenant_id = $1 AND g.deleted_at IS NULL
        ORDER BY g.created_at DESC`,
      [tenant_id],
    ),
    db.query(
      `SELECT g.id, g.name, g.created_at, g.status, g.score, g.deleted_at, g.deleted_reason, g.replaced_by, g.deleted_by,
              CASE WHEN r.id IS NULL THEN NULL ELSE json_build_object('id', r.id, 'name', r.name) END AS replacement,
              CASE WHEN d.id IS NULL THEN NULL ELSE json_build_object('id', d.id, 'name', d.name) END AS deleter
         FROM generated_schedules g
         LEFT JOIN generated_schedules r ON r.id = g.replaced_by
         LEFT JOIN profiles d ON d.id = g.deleted_by
        WHERE g.tenant_id = $1 AND g.deleted_at IS NOT NULL
        ORDER BY g.deleted_at DESC`,
      [tenant_id],
    ),
  ])

  return (
    <SchedulesHistory
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      schedules={schedules as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deletedSchedules={deleted as any}
    />
  )
}
