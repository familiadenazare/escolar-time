import { notFound, redirect } from 'next/navigation'
import { getEditorProfile } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { GridForm } from '@/components/grids/grid-form'

async function loadVigencias(tenantId: string) {
  const rows = await db.query<{ vigencia: string }>(
    'SELECT DISTINCT vigencia FROM time_grids WHERE tenant_id = $1 AND vigencia IS NOT NULL',
    [tenantId],
  )
  return rows.map((r) => r.vigencia).sort((a, b) => b.localeCompare(a, 'pt-BR', { numeric: true }))
}

interface EditGridPageProps {
  params: Promise<{ id: string }>
}

type DbSlot = {
  id: string
  day_of_week: number
  slot_order: number
  duration_minutes: number
  type: string
  label: string | null
}

export default async function EditGridPage({ params }: EditGridPageProps) {
  const editor = await getEditorProfile()
  if (!editor) redirect('/dashboard/grids')

  const { id } = await params
  const [grid, classGroups, vigencias] = await Promise.all([
    db.one<{
      id: string
      name: string
      shift: 'MORNING' | 'AFTERNOON' | 'EVENING'
      start_time: string | null
      days_of_week: number[] | null
      active: boolean
      vigencia: string | null
      class_group_id: string | null
      school_unit_id: string
      time_slots: DbSlot[]
    }>(
      `SELECT g.id, g.name, g.shift, g.start_time, g.days_of_week, g.active, g.vigencia, g.class_group_id, g.school_unit_id,
              coalesce((SELECT json_agg(json_build_object(
                          'id', s.id, 'day_of_week', s.day_of_week, 'slot_order', s.slot_order,
                          'duration_minutes', s.duration_minutes, 'type', s.type, 'label', s.label))
                          FROM time_slots s WHERE s.time_grid_id = g.id), '[]') AS time_slots
         FROM time_grids g
        WHERE g.id = $1 AND g.tenant_id = $2`,
      [id, editor.tenant_id],
    ),
    db.query<{ id: string; name: string; school_units: { id: string; name: string } }>(
      `SELECT cg.id, cg.name, json_build_object('id', su.id, 'name', su.name) AS school_units
         FROM class_groups cg JOIN school_units su ON su.id = cg.school_unit_id
        WHERE cg.tenant_id = $1 AND cg.active
        ORDER BY cg.name`,
      [editor.tenant_id],
    ),
    loadVigencias(editor.tenant_id),
  ])

  if (!grid) notFound()

  const allSlots = grid.time_slots

  // Group by day_of_week, sorted by slot_order
  const slotsByDay: Record<number, DbSlot[]> = {}
  for (const slot of allSlots) {
    if (!slotsByDay[slot.day_of_week]) slotsByDay[slot.day_of_week] = []
    slotsByDay[slot.day_of_week].push(slot)
  }
  for (const day of Object.keys(slotsByDay)) {
    slotsByDay[Number(day)].sort((a, b) => a.slot_order - b.slot_order)
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Editar Grade Horária</h1>
        <p className="text-slate text-sm mt-1">
          Atualize os horários de aulas e intervalos por dia da semana.
        </p>
      </div>
      <GridForm
        classGroups={classGroups}
        vigencias={vigencias}
        initialData={{
          id: grid.id,
          class_group_id: grid.class_group_id,
          name: grid.name,
          vigencia: grid.vigencia ?? '',
          shift: grid.shift,
          start_time: grid.start_time ?? '07:00',
          days_of_week: grid.days_of_week ?? [],
          active: grid.active,
          slotsByDay,
        }}
      />
    </div>
  )
}
