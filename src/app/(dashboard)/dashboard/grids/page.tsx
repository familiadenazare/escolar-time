import { db } from '@/lib/db'
import { requireProfile } from '@/lib/auth/session'
import { GridsTable } from '@/components/grids/grids-table'

export default async function GridsPage() {
  const { tenant_id } = await requireProfile()

  const grids = await db.query(
    `SELECT g.id, g.name, g.shift, g.days_of_week, g.start_time, g.active, g.vigencia, g.class_group_id,
            CASE WHEN cg.id IS NULL THEN NULL ELSE json_build_object(
              'id', cg.id, 'name', cg.name,
              'school_units', json_build_object('id', su.id, 'name', su.name)) END AS class_groups,
            coalesce((SELECT json_agg(json_build_object('id', s.id, 'type', s.type, 'day_of_week', s.day_of_week))
                        FROM time_slots s WHERE s.time_grid_id = g.id), '[]') AS time_slots
       FROM time_grids g
       LEFT JOIN class_groups cg ON cg.id = g.class_group_id
       LEFT JOIN school_units su ON su.id = cg.school_unit_id
      WHERE g.tenant_id = $1
      ORDER BY g.name`,
    [tenant_id],
  )

  return <GridsTable grids={grids as Parameters<typeof GridsTable>[0]['grids']} />
}
