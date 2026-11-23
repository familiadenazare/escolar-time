import { db } from '@/lib/db'
import { requireProfile } from '@/lib/auth/session'
import { ConstraintsManager } from '@/components/constraints/constraints-manager'

export default async function ConstraintsPage() {
  const { tenant_id } = await requireProfile()

  const [teachers, constraints] = await Promise.all([
    db.query<{ id: string; name: string; active: boolean }>(
      'SELECT id, name, active FROM teachers WHERE tenant_id = $1 AND active ORDER BY name',
      [tenant_id],
    ),
    db.query(
      `SELECT c.id, c.teacher_id, c.type, c.priority, c.days_of_week, c.time_from, c.time_to, c.slot_order,
              c.min_gap_slots, c.value, c.description, c.active, c.school_unit_id, c.subject_id,
              json_build_object('id', t.id, 'name', t.name) AS teachers,
              CASE WHEN su.id IS NULL THEN NULL ELSE json_build_object('id', su.id, 'name', su.name) END AS school_units,
              CASE WHEN s.id IS NULL THEN NULL ELSE json_build_object('id', s.id, 'name', s.name) END AS subjects
         FROM teacher_constraints c
         JOIN teachers t ON t.id = c.teacher_id
         LEFT JOIN school_units su ON su.id = c.school_unit_id
         LEFT JOIN subjects s ON s.id = c.subject_id
        WHERE c.tenant_id = $1
        ORDER BY c.created_at DESC`,
      [tenant_id],
    ),
  ])

  return (
    <ConstraintsManager
      teachers={teachers}
      constraints={constraints as Parameters<typeof ConstraintsManager>[0]['constraints']}
    />
  )
}
