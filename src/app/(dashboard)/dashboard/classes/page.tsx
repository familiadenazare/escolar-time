import { db } from '@/lib/db'
import { requireProfile } from '@/lib/auth/session'
import { listActiveUnits } from '@/lib/queries'
import { ClassesTable } from '@/components/classes/classes-table'

export default async function ClassesPage() {
  const { tenant_id } = await requireProfile()

  const [classes, units] = await Promise.all([
    db.query<{
      id: string
      name: string
      shift: string
      year: number
      active: boolean
      school_units: { id: string; name: string }[]
      regente: { name: string } | null
    }>(
      `SELECT cg.id, cg.name, cg.shift, cg.year, cg.active,
              json_build_array(json_build_object('id', su.id, 'name', su.name)) AS school_units,
              CASE WHEN t.id IS NULL THEN NULL ELSE json_build_object('name', t.name) END AS regente
         FROM class_groups cg
         JOIN school_units su ON su.id = cg.school_unit_id
         LEFT JOIN teachers t ON t.id = cg.homeroom_teacher_id
        WHERE cg.tenant_id = $1
        ORDER BY cg.name`,
      [tenant_id],
    ),
    listActiveUnits(tenant_id),
  ])

  return <ClassesTable classes={classes} units={units} />
}
