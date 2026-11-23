import { db } from '@/lib/db'
import type {
  BaselineSchedule,
  EngineAssignment,
  EngineClassGroup,
  EngineConstraint,
  EngineGlobalRule,
  EngineInput,
  EngineTeacher,
  EngineTimeGrid,
  EngineTimeSlot,
  Priority,
  SlotType,
} from './types'
import { normalizeTime } from './time'

// ─── Raw row shapes (relaxed; Supabase types cast at edges) ───────────────────

type RawTeacher = {
  id: string
  name: string
  active: boolean
}

type RawConstraint = {
  id: string
  teacher_id: string
  type: string
  priority: string
  days_of_week: number[] | null
  school_unit_id: string | null
  subject_id: string | null
  time_from: string | null
  time_to: string | null
  slot_order: number | null
  min_gap_slots: number | null
  value: Record<string, unknown> | null
  active: boolean
}

type RawGlobalRule = {
  type: string
  priority: string
  weight: number | null
  params: Record<string, unknown> | null
}

type RawSubject = { id: string; name: string }

type RawTeachingAssignment = {
  id: string
  teacher_id: string | null
}

type RawClassSubject = {
  id: string
  weekly_lessons: number
  allow_double_lesson: boolean
  group_key: string | null
  subjects: RawSubject | RawSubject[] | null
  // PostgREST devolve objeto (não array) porque teaching_assignments.class_subject_id é UNIQUE
  teaching_assignments: RawTeachingAssignment | RawTeachingAssignment[] | null
}

type RawTimeSlot = {
  id: string
  day_of_week: number
  slot_order: number
  duration_minutes: number
  type: string
  start_time: string | null
  end_time: string | null
  label: string | null
}

export type RawTimeGrid = {
  id: string
  class_group_id: string | null
  start_time: string
  days_of_week: number[]
  active: boolean
  vigencia: string | null
  time_slots: RawTimeSlot[] | null
}

type RawClassGroup = {
  id: string
  name: string
  school_unit_id: string
  active: boolean
  homeroom_teacher_id: string | null
  class_subjects: RawClassSubject[] | null
  time_grids: RawTimeGrid[] | null
}

type RawBaselineEntry = {
  teaching_assignment_id: string
  day_of_week: number
  time_slot_id: string
  time_slots: { slot_order: number } | { slot_order: number }[] | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function firstOf<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function addMinutes(time: string, minutes: number): string {
  const [hStr, mStr] = time.split(':')
  const h = parseInt(hStr ?? '0', 10)
  const m = parseInt(mStr ?? '0', 10)
  const total = h * 60 + m + minutes
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function buildSlotsByDay(
  raw: RawTimeSlot[],
  gridStart: string
): Record<number, EngineTimeSlot[]> {
  const grouped = new Map<number, RawTimeSlot[]>()
  for (const s of raw) {
    let arr = grouped.get(s.day_of_week)
    if (!arr) {
      arr = []
      grouped.set(s.day_of_week, arr)
    }
    arr.push(s)
  }

  const out: Record<number, EngineTimeSlot[]> = {}
  for (const [day, slots] of grouped) {
    slots.sort((a, b) => a.slot_order - b.slot_order)
    let cursor = normalizeTime(gridStart)
    out[day] = slots.map((s) => {
      // Usa o horário gravado no slot (o mesmo que a tela mostra); o encadeamento por
      // duração é só fallback para slots antigos sem start/end.
      const start = s.start_time ? normalizeTime(s.start_time) : cursor
      const end = s.end_time ? normalizeTime(s.end_time) : addMinutes(start, s.duration_minutes)
      cursor = end
      return {
        id: s.id,
        order: s.slot_order,
        durationMinutes: s.duration_minutes,
        type: (s.type === 'BREAK' || s.type === 'ROUTINE' ? s.type : 'LESSON') as SlotType,
        startTime: start,
        endTime: end,
        label: s.label ?? undefined,
      }
    })
  }
  return out
}

function normalizePriority(p: string): Priority {
  return p === 'MANDATORY' ? 'MANDATORY' : 'PREFERRED'
}

function normalizeConstraint(r: RawConstraint): EngineConstraint {
  return {
    id: r.id,
    type: r.type,
    priority: normalizePriority(r.priority),
    weight: typeof r.value?.weight === 'number' ? r.value.weight : 1,
    daysOfWeek: r.days_of_week ?? [],
    schoolUnitId: r.school_unit_id ?? undefined,
    subjectId: r.subject_id ?? undefined,
    // Normaliza "HH:MM:SS" → "HH:MM": as comparações com os horários dos slots são textuais.
    timeFrom: r.time_from ? normalizeTime(r.time_from) : undefined,
    timeTo: r.time_to ? normalizeTime(r.time_to) : undefined,
    slotOrder: r.slot_order ?? undefined,
    minGapSlots: r.min_gap_slots ?? undefined,
    value: r.value ?? undefined,
  }
}

// ─── Loader ───────────────────────────────────────────────────────────────────

/**
 * Escolhe a grade da turma. Com vigência informada, só vale a grade ativa daquela
 * vigência (a turma sem grade nela fica sem grade). Sem vigência, usa a grade ativa
 * da vigência mais recente.
 */
export function pickGrid(grids: RawTimeGrid[], vigencia: string | null | undefined): RawTimeGrid | null {
  const active = grids.filter((g) => g.active)
  if (vigencia !== undefined) {
    return active.find((g) => (g.vigencia ?? null) === vigencia) ?? null
  }
  const sorted = [...active].sort((a, b) => {
    if (!a.vigencia) return 1
    if (!b.vigencia) return -1
    return b.vigencia.localeCompare(a.vigencia, 'pt-BR', { numeric: true })
  })
  return sorted[0] ?? null
}

export async function loadEngineInput(
  tenantId: string,
  baselineScheduleId?: string,
  baselineWeight: number = 0.5,
  /** Vigência das grades a usar; undefined = a mais recente de cada turma. */
  vigencia?: string | null
): Promise<EngineInput> {
  // 1. Class groups + class_subjects (subjects + teaching_assignments) + time_grids + slots
  const classGroupsRows = await db
    .query<RawClassGroup>(
      `SELECT cg.id, cg.name, cg.school_unit_id, cg.active, cg.homeroom_teacher_id,
              coalesce((
                SELECT json_agg(json_build_object(
                  'id', cs.id, 'weekly_lessons', cs.weekly_lessons,
                  'allow_double_lesson', cs.allow_double_lesson, 'group_key', cs.group_key,
                  'subjects', json_build_object('id', s.id, 'name', s.name),
                  'teaching_assignments', (
                    SELECT json_build_object('id', ta.id, 'teacher_id', ta.teacher_id)
                      FROM teaching_assignments ta WHERE ta.class_subject_id = cs.id)))
                  FROM class_subjects cs JOIN subjects s ON s.id = cs.subject_id
                 WHERE cs.class_group_id = cg.id), '[]') AS class_subjects,
              coalesce((
                SELECT json_agg(json_build_object(
                  'id', g.id, 'class_group_id', g.class_group_id, 'start_time', g.start_time,
                  'days_of_week', g.days_of_week, 'active', g.active, 'vigencia', g.vigencia,
                  'time_slots', coalesce((
                    SELECT json_agg(json_build_object(
                      'id', ts.id, 'day_of_week', ts.day_of_week, 'slot_order', ts.slot_order,
                      'duration_minutes', ts.duration_minutes, 'type', ts.type,
                      'start_time', ts.start_time, 'end_time', ts.end_time, 'label', ts.label))
                      FROM time_slots ts WHERE ts.time_grid_id = g.id), '[]')))
                  FROM time_grids g WHERE g.class_group_id = cg.id), '[]') AS time_grids
         FROM class_groups cg
        WHERE cg.tenant_id = $1 AND cg.active`,
      [tenantId],
    )
    .catch((e: Error) => {
      throw new Error(`Falha ao carregar turmas: ${e.message}`)
    })

  // 2. Teachers + constraints
  const teachers = await db
    .query<RawTeacher>('SELECT id, name, active FROM teachers WHERE tenant_id = $1 AND active', [tenantId])
    .catch((e: Error) => {
      throw new Error(`Falha ao carregar professores: ${e.message}`)
    })

  const constraintsRows = await db
    .query<RawConstraint>(
      `SELECT id, teacher_id, type, priority, days_of_week, school_unit_id, subject_id, time_from, time_to,
              slot_order, min_gap_slots, value, active
         FROM teacher_constraints WHERE tenant_id = $1 AND active`,
      [tenantId],
    )
    .catch((e: Error) => {
      throw new Error(`Falha ao carregar restrições: ${e.message}`)
    })
  const allConstraints = constraintsRows.map(normalizeConstraint)
  const constraintsByTeacher = new Map<string, EngineConstraint[]>()
  for (const row of constraintsRows) {
    const c = normalizeConstraint(row)
    let arr = constraintsByTeacher.get(row.teacher_id)
    if (!arr) {
      arr = []
      constraintsByTeacher.set(row.teacher_id, arr)
    }
    arr.push(c)
  }

  // 3. Global rules
  const rulesRaw = await db
    .query<RawGlobalRule>('SELECT type, priority, weight, params FROM global_rules WHERE tenant_id = $1 AND active', [
      tenantId,
    ])
    .catch((e: Error) => {
      throw new Error(`Falha ao carregar regras globais: ${e.message}`)
    })

  const globalRules: EngineGlobalRule[] = rulesRaw.map((row) => {
    return {
      type: row.type,
      priority: normalizePriority(row.priority),
      weight: row.weight ?? 1,
      params: row.params ?? {},
    }
  })

  // 4. Build assignments + group by teacher / class
  const assignmentsByTeacher = new Map<string, EngineAssignment[]>()
  const assignmentsByClass = new Map<string, EngineAssignment[]>()
  const allAssignments: EngineAssignment[] = []

  for (const cg of classGroupsRows) {
    for (const cs of cg.class_subjects ?? []) {
      const ta = firstOf(cs.teaching_assignments)
      if (!ta || !ta.teacher_id) continue
      const subj = firstOf(cs.subjects)
      const a: EngineAssignment = {
        id: ta.id,
        teacherId: ta.teacher_id,
        classGroupId: cg.id,
        classGroupName: cg.name,
        schoolUnitId: cg.school_unit_id,
        subjectId: subj?.id ?? '',
        subjectName: subj?.name ?? '',
        weeklyLessons: cs.weekly_lessons,
        allowDoubleLesson: cs.allow_double_lesson,
        groupKey: cs.group_key ?? undefined,
      }
      allAssignments.push(a)
      let tarr = assignmentsByTeacher.get(a.teacherId)
      if (!tarr) {
        tarr = []
        assignmentsByTeacher.set(a.teacherId, tarr)
      }
      tarr.push(a)
      let carr = assignmentsByClass.get(cg.id)
      if (!carr) {
        carr = []
        assignmentsByClass.set(cg.id, carr)
      }
      carr.push(a)
    }
  }

  // 5. Build time grids per class group (grade ativa da vigência — ver pickGrid)
  const allTimeGrids: EngineTimeGrid[] = []
  const gridByClass = new Map<string, EngineTimeGrid>()
  for (const cg of classGroupsRows) {
    const g = pickGrid(cg.time_grids ?? [], vigencia)
    if (!g) continue
    const tg: EngineTimeGrid = {
      id: g.id,
      classGroupId: cg.id,
      startTime: g.start_time,
      daysOfWeek: g.days_of_week ?? [],
      slotsByDay: buildSlotsByDay(g.time_slots ?? [], g.start_time),
    }
    allTimeGrids.push(tg)
    gridByClass.set(cg.id, tg)
  }

  // 6. Compose engine class groups
  const classGroups: EngineClassGroup[] = classGroupsRows.map((cg) => ({
    id: cg.id,
    name: cg.name,
    schoolUnitId: cg.school_unit_id,
    assignments: assignmentsByClass.get(cg.id) ?? [],
    timeGrid: gridByClass.get(cg.id),
    homeroomTeacherId: cg.homeroom_teacher_id ?? undefined,
  }))

  // 7. Compose engine teachers
  const engineTeachers: EngineTeacher[] = teachers.map((t) => ({
    id: t.id,
    name: t.name,
    assignments: assignmentsByTeacher.get(t.id) ?? [],
    constraints: constraintsByTeacher.get(t.id) ?? [],
  }))

  // 8. Baseline (best-effort — table may not exist yet)
  let baseline: BaselineSchedule | undefined
  if (baselineScheduleId) {
    try {
      const rows = await db.query<RawBaselineEntry>(
        `SELECT e.teaching_assignment_id, e.day_of_week, e.time_slot_id,
                json_build_object('slot_order', ts.slot_order) AS time_slots
           FROM schedule_entries e JOIN time_slots ts ON ts.id = e.time_slot_id
          WHERE e.generated_schedule_id = $1`,
        [baselineScheduleId],
      )
      if (rows.length > 0) {
        // A base pode ser de outra vigência (outra grade, outros ids de slot): a aula é
        // levada para o slot na mesma posição (dia + ordem) da grade usada agora.
        const classByAssignment = new Map(allAssignments.map((a) => [a.id, a.classGroupId]))
        const currentSlotIds = new Set(
          allTimeGrids.flatMap((g) => Object.values(g.slotsByDay).flat().map((sl) => sl.id))
        )
        const mapSlot = (e: RawBaselineEntry): string => {
          if (currentSlotIds.has(e.time_slot_id)) return e.time_slot_id
          const order = firstOf(e.time_slots)?.slot_order
          const classId = classByAssignment.get(e.teaching_assignment_id)
          const grid = classId ? gridByClass.get(classId) : undefined
          const match = grid?.slotsByDay[e.day_of_week]?.find((sl) => sl.order === order)
          return match?.id ?? e.time_slot_id
        }
        baseline = {
          entries: rows.map((e) => ({
            assignmentId: e.teaching_assignment_id,
            day: e.day_of_week,
            slotId: mapSlot(e),
          })),
        }
      }
    } catch {
      // baseline table absent — skip
    }
  }

  return {
    tenantId,
    teachers: engineTeachers,
    classGroups,
    timeGrids: allTimeGrids,
    constraints: allConstraints,
    globalRules,
    baseline,
    baselineWeight,
  }
}
