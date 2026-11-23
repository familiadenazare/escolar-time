import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requireProfile } from '@/lib/auth/session'
import { ScheduleGrid } from '@/components/schedule/schedule-grid'

type Props = {
  params: Promise<{ id: string }>
}

type GridSlotRow = {
  id: string
  day_of_week: number | null
  slot_order: number
  start_time: string
  end_time: string
  type: string | null
  label: string | null
}

export default async function ScheduleDetailPage({ params }: Props) {
  const { id } = await params
  const { tenant_id } = await requireProfile()

  const schedule = await db.one<{
    id: string
    name: string
    status: string | null
    score: number | null
    violations: unknown
    config_snapshot: unknown
    created_at: string
    deleted_at: string | null
    deleted_reason: string | null
    deleted_by: string | null
    replacement: { id: string; name: string } | null
    deleter: { name: string } | null
  }>(
    `SELECT g.id, g.name, g.status, g.score, g.violations, g.config_snapshot, g.created_at, g.deleted_at,
            g.deleted_reason, g.deleted_by,
            CASE WHEN r.id IS NULL THEN NULL ELSE json_build_object('id', r.id, 'name', r.name) END AS replacement,
            CASE WHEN d.id IS NULL THEN NULL ELSE json_build_object('name', d.name) END AS deleter
       FROM generated_schedules g
       LEFT JOIN generated_schedules r ON r.id = g.replaced_by
       LEFT JOIN profiles d ON d.id = g.deleted_by
      WHERE g.id = $1 AND g.tenant_id = $2`,
    [id, tenant_id],
  )

  if (!schedule) notFound()

  if (schedule.status === 'FAILED') {
    const errors = Array.isArray(schedule.violations)
      ? (schedule.violations as string[])
      : []
    const snapshot = (schedule.config_snapshot ?? {}) as { warnings?: string[] }
    const warnings = snapshot.warnings ?? []

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">{schedule.name}</h1>
          <p className="text-slate text-sm mt-1">Este horário falhou durante a geração.</p>
        </div>
        <div className="rounded-md border border-red-200 bg-red-50 p-6 space-y-3">
          <p className="font-semibold text-red-700">Erros encontrados:</p>
          {errors.length === 0 ? (
            <p className="text-sm text-red-600">Erro desconhecido.</p>
          ) : (
            <ul className="list-disc list-inside space-y-1">
              {errors.map((err, i) => (
                <li key={i} className="text-sm text-red-600">
                  {err}
                </li>
              ))}
            </ul>
          )}
        </div>
        {warnings.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-6 space-y-2">
            <p className="font-semibold text-amber-800">Avisos:</p>
            <ul className="list-disc list-inside space-y-1">
              {warnings.map((w, i) => (
                <li key={i} className="text-sm text-amber-700">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  const entries = await db.query(
    `SELECT e.id, e.day_of_week, e.locked, e.time_slot_id,
            json_build_object('time_grid_id', ts.time_grid_id) AS time_slots,
            json_build_object(
              'id', ta.id,
              'teachers', json_build_object('id', t.id, 'name', t.name),
              'class_subjects', json_build_object(
                'id', cs.id,
                'group_key', cs.group_key,
                'subjects', json_build_object('id', s.id, 'name', s.name, 'color', s.color),
                'class_groups', json_build_object(
                  'id', cg.id, 'name', cg.name,
                  'school_units', json_build_object('id', su.id, 'name', su.name)))) AS teaching_assignments
       FROM schedule_entries e
       JOIN time_slots ts ON ts.id = e.time_slot_id
       JOIN teaching_assignments ta ON ta.id = e.teaching_assignment_id
       JOIN teachers t ON t.id = ta.teacher_id
       JOIN class_subjects cs ON cs.id = ta.class_subject_id
       JOIN subjects s ON s.id = cs.subject_id
       JOIN class_groups cg ON cg.id = cs.class_group_id
       JOIN school_units su ON su.id = cg.school_unit_id
      WHERE e.generated_schedule_id = $1
      ORDER BY e.day_of_week`,
    [id],
  )

  // A grade completa não pode ser derivada das entradas: intervalos e horários
  // vagos não geram schedule_entries, e cada dia tem um número diferente de aulas.
  const classGroupIds = Array.from(
    new Set(
      entries
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((e: any) => e.teaching_assignments?.class_subjects?.class_groups?.id)
        .filter((v): v is string => typeof v === 'string')
    )
  )

  // A grade de cada turma é a dos slots que o horário usou — com várias vigências, a
  // grade "ativa" pode ser outra. Turmas sem aula caem na grade ativa (fallback).
  const usedGridIds = Array.from(
    new Set(
      entries
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((e: any) => (Array.isArray(e.time_slots) ? e.time_slots[0] : e.time_slots)?.time_grid_id)
        .filter((v): v is string => typeof v === 'string')
    )
  )

  type GridRow = { id: string; class_group_id: string | null; time_slots: GridSlotRow[] }
  const GRID_SELECT = `
    SELECT g.id, g.class_group_id,
           coalesce((SELECT json_agg(json_build_object(
                       'id', s.id, 'day_of_week', s.day_of_week, 'slot_order', s.slot_order,
                       'start_time', s.start_time, 'end_time', s.end_time, 'type', s.type, 'label', s.label))
                       FROM time_slots s WHERE s.time_grid_id = g.id), '[]') AS time_slots
      FROM time_grids g`
  const usedGrids = usedGridIds.length
    ? await db.query<GridRow>(`${GRID_SELECT} WHERE g.id = ANY($1::uuid[]) AND g.tenant_id = $2`, [usedGridIds, tenant_id])
    : []

  const coveredClasses = new Set(usedGrids.map((g) => g.class_group_id))
  const missingClassIds = classGroupIds.filter((id) => !coveredClasses.has(id))
  const fallbackGrids = missingClassIds.length
    ? await db.query<GridRow>(
        `${GRID_SELECT} WHERE g.class_group_id = ANY($1::uuid[]) AND g.active AND g.tenant_id = $2`,
        [missingClassIds, tenant_id],
      )
    : []

  const seen = new Set<string>()
  const grids = [...usedGrids, ...fallbackGrids].filter((g) => {
    if (!g.class_group_id || seen.has(g.class_group_id)) return false
    seen.add(g.class_group_id)
    return true
  })

  // Regente de cada turma: conduz as rotinas da grade (mostrada nas células de rotina).
  const gridClassIds = grids.map((g) => g.class_group_id as string)
  type Regente = { id: string; name: string }
  const regentes = gridClassIds.length
    ? await db.query<{ id: string; regente: Regente | null }>(
        `SELECT cg.id, CASE WHEN t.id IS NULL THEN NULL ELSE json_build_object('id', t.id, 'name', t.name) END AS regente
           FROM class_groups cg LEFT JOIN teachers t ON t.id = cg.homeroom_teacher_id
          WHERE cg.id = ANY($1::uuid[])`,
        [gridClassIds],
      )
    : []
  const regenteByClass = new Map(regentes.map((r) => [r.id, r.regente]))

  const gridsByClass = grids.map((g) => ({
    classGroupId: g.class_group_id as string,
    slots: g.time_slots.filter((s) => s.day_of_week != null),
    homeroomTeacher: regenteByClass.get(g.class_group_id as string) ?? null,
  }))

  return (
    <ScheduleGrid
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      schedule={schedule as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      entries={entries as any}
      grids={gridsByClass}
    />
  )
}
