'use server'

import { revalidatePath } from 'next/cache'
import { bulkValues, db, isForeignKeyViolation, tx, type Queryable } from '@/lib/db'
import { editorAction, type ActionResult } from '@/lib/actions'
import type { SessionProfile } from '@/lib/auth/session'

// ─── Types ────────────────────────────────────────────────────────────────────

type GridData = {
  class_group_id: string | null
  name: string
  shift: 'MORNING' | 'AFTERNOON' | 'EVENING'
  start_time: string
  days_of_week: number[]
  /** Vigência (pasta) da grade, ex.: "2026/2". null = sem vigência. */
  vigencia: string | null
}

/** LESSON = aula · BREAK = intervalo · ROUTINE = atividade fixa (não é aula nem intervalo). */
type SlotKind = 'LESSON' | 'BREAK' | 'ROUTINE'

type SlotData = {
  slot_order: number
  duration_minutes: number
  start_time: string
  end_time: string
  type: SlotKind
  label?: string
}

type SlotsByDay = Record<number, SlotData[]>

type SlotRow = {
  day_of_week: number
  slot_order: number
  duration_minutes: number | null
  start_time: string | null
  end_time: string | null
  type: SlotKind
  label: string | null
}

/** Erro de negócio que vira { success: false, error } sem ser erro do banco. */
class UserError extends Error {}

const SLOT_IN_USE =
  'Não é possível remover horários que já são usados em um horário gerado. Exclua esse horário gerado antes ou mantenha a quantidade de slots.'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeVigencia(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

/**
 * Uma turma tem no máximo uma grade por vigência — é por ela que a geração escolhe a
 * grade de cada turma. Retorna o nome da grade conflitante, se houver.
 */
async function findConflictingGrid(
  q: Queryable,
  tenantId: string,
  classGroupId: string,
  vigencia: string | null,
  excludeId?: string,
): Promise<string | null> {
  const row = await q.one<{ name: string }>(
    `SELECT name FROM time_grids
      WHERE tenant_id = $1 AND class_group_id = $2
        AND vigencia IS NOT DISTINCT FROM $3
        AND ($4::uuid IS NULL OR id <> $4::uuid)
      LIMIT 1`,
    [tenantId, classGroupId, vigencia, excludeId ?? null],
  )
  return row?.name ?? null
}

function conflictMessage(gridName: string, vigencia: string | null) {
  return `Esta turma já tem a grade "${gridName}" ${vigencia ? `na vigência ${vigencia}` : 'sem vigência'}. Escolha outra vigência ou edite a grade existente.`
}

async function resolveSchoolUnitId(q: Queryable, tenantId: string, classGroupId: string): Promise<string> {
  const row = await q.one<{ school_unit_id: string }>(
    'SELECT school_unit_id FROM class_groups WHERE id = $1 AND tenant_id = $2',
    [classGroupId, tenantId],
  )
  if (!row) throw new UserError('Turma não encontrada.')
  return row.school_unit_id
}

function flattenSlots(slotsByDay: SlotsByDay): SlotRow[] {
  const rows: SlotRow[] = []
  for (const [dayStr, slots] of Object.entries(slotsByDay)) {
    const day = Number(dayStr)
    slots.forEach((slot, idx) => {
      rows.push({
        day_of_week: day,
        slot_order: idx + 1,
        duration_minutes: slot.duration_minutes,
        start_time: slot.start_time,
        end_time: slot.end_time,
        type: slot.type,
        label: slot.label ?? null,
      })
    })
  }
  return rows
}

async function insertSlots(q: Queryable, gridId: string, rows: SlotRow[]) {
  if (rows.length === 0) return
  const { values, params } = bulkValues(
    rows.map((r) => [gridId, r.day_of_week, r.slot_order, r.duration_minutes, r.start_time, r.end_time, r.type, r.label]),
  )
  await q.query(
    `INSERT INTO time_slots (time_grid_id, day_of_week, slot_order, duration_minutes, start_time, end_time, type, label)
     VALUES ${values}`,
    params,
  )
}

/**
 * Sincroniza os slots da grade sem apagar tudo: slots existentes na mesma posição
 * (dia + ordem) são atualizados no lugar, mantendo o id — isso preserva as referências
 * de horários já gerados (schedule_entries.time_slot_id). Só insere os novos e remove
 * os que deixaram de existir.
 */
async function syncTimeSlots(q: Queryable, gridId: string, rows: SlotRow[]) {
  const existing = await q.query<{ id: string; day_of_week: number; slot_order: number }>(
    'SELECT id, day_of_week, slot_order FROM time_slots WHERE time_grid_id = $1',
    [gridId],
  )

  const key = (day: number, order: number) => `${day}:${order}`
  const existingByKey = new Map(existing.map((s) => [key(s.day_of_week, s.slot_order), s.id]))
  const keptKeys = new Set<string>()
  const toInsert: SlotRow[] = []

  for (const row of rows) {
    const k = key(row.day_of_week, row.slot_order)
    const slotId = existingByKey.get(k)
    if (!slotId) {
      toInsert.push(row)
      continue
    }
    keptKeys.add(k)
    await q.query(
      'UPDATE time_slots SET duration_minutes = $1, start_time = $2, end_time = $3, type = $4, label = $5 WHERE id = $6',
      [row.duration_minutes, row.start_time, row.end_time, row.type, row.label, slotId],
    )
  }

  const toDeleteIds = [...existingByKey.entries()].filter(([k]) => !keptKeys.has(k)).map(([, id]) => id)
  if (toDeleteIds.length > 0) {
    try {
      await q.query('DELETE FROM time_slots WHERE id = ANY($1::uuid[])', [toDeleteIds])
    } catch (e) {
      if (isForeignKeyViolation(e)) throw new UserError(SLOT_IN_USE)
      throw e
    }
  }

  await insertSlots(q, gridId, toInsert)
}

/** editorAction + erros de negócio (UserError) como mensagem. */
function gridAction(fn: (p: SessionProfile) => Promise<ActionResult | void>): Promise<ActionResult> {
  return editorAction(async (p) => {
    try {
      return await fn(p)
    } catch (e) {
      if (e instanceof UserError) return { success: false, error: e.message }
      throw e
    }
  })
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function createTimeGrid(gridData: GridData, slotsByDay: SlotsByDay): Promise<ActionResult> {
  return gridAction(async (p) => {
    const classGroupId = gridData.class_group_id
    if (!classGroupId) return { success: false, error: 'Turma é obrigatória.' }
    const vigencia = normalizeVigencia(gridData.vigencia)

    await tx(p.id, async (q) => {
      const schoolUnitId = await resolveSchoolUnitId(q, p.tenant_id, classGroupId)
      const conflict = await findConflictingGrid(q, p.tenant_id, classGroupId, vigencia)
      if (conflict) throw new UserError(conflictMessage(conflict, vigencia))

      const grid = await q.one<{ id: string }>(
        `INSERT INTO time_grids
           (tenant_id, school_unit_id, class_group_id, name, shift, start_time, days_of_week, vigencia, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7::int[], $8, true)
         RETURNING id`,
        [p.tenant_id, schoolUnitId, classGroupId, gridData.name, gridData.shift, gridData.start_time, gridData.days_of_week, vigencia],
      )
      await insertSlots(q, grid!.id, flattenSlots(slotsByDay))
    })

    revalidatePath('/dashboard/grids')
  })
}

export async function updateTimeGrid(id: string, gridData: GridData, slotsByDay: SlotsByDay): Promise<ActionResult> {
  return gridAction(async (p) => {
    const classGroupId = gridData.class_group_id
    if (!classGroupId) return { success: false, error: 'Turma é obrigatória.' }
    const vigencia = normalizeVigencia(gridData.vigencia)

    await tx(p.id, async (q) => {
      const schoolUnitId = await resolveSchoolUnitId(q, p.tenant_id, classGroupId)
      const conflict = await findConflictingGrid(q, p.tenant_id, classGroupId, vigencia, id)
      if (conflict) throw new UserError(conflictMessage(conflict, vigencia))

      await q.query(
        `UPDATE time_grids
            SET school_unit_id = $1, class_group_id = $2, name = $3, shift = $4, start_time = $5,
                days_of_week = $6::int[], vigencia = $7
          WHERE id = $8 AND tenant_id = $9`,
        [schoolUnitId, classGroupId, gridData.name, gridData.shift, gridData.start_time, gridData.days_of_week, vigencia, id, p.tenant_id],
      )
      await syncTimeSlots(q, id, flattenSlots(slotsByDay))
    })

    revalidatePath('/dashboard/grids')
  })
}

type GridWithSlots = {
  id: string
  school_unit_id: string
  class_group_id: string | null
  name: string
  shift: string
  start_time: string | null
  days_of_week: number[]
  active: boolean
  vigencia: string | null
  time_slots: SlotRow[]
}

const GRID_WITH_SLOTS = `
  SELECT g.id, g.school_unit_id, g.class_group_id, g.name, g.shift, g.start_time, g.days_of_week, g.active, g.vigencia,
         coalesce((SELECT json_agg(json_build_object(
                     'day_of_week', s.day_of_week, 'slot_order', s.slot_order, 'duration_minutes', s.duration_minutes,
                     'start_time', s.start_time, 'end_time', s.end_time, 'type', s.type, 'label', s.label))
                     FROM time_slots s WHERE s.time_grid_id = g.id), '[]') AS time_slots
    FROM time_grids g`

/** Nome da cópia: troca a vigência de origem pela de destino; sem ela no nome, acrescenta. */
function copyName(name: string, from: string | null, to: string | null): string {
  if (from && to && from !== to && name.includes(from)) return name.replace(from, to)
  if (from === to) return `${name} (cópia)`
  return to ? `${name} — ${to}` : `${name} (cópia)`
}

/** Copia a grade com seus slots para a vigência de destino. */
async function copyGrid(
  q: Queryable,
  tenantId: string,
  original: GridWithSlots,
  vigencia: string | null,
  keepClassGroup: boolean,
) {
  const grid = await q.one<{ id: string }>(
    `INSERT INTO time_grids
       (tenant_id, school_unit_id, class_group_id, name, shift, start_time, days_of_week, vigencia, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7::int[], $8, $9)
     RETURNING id`,
    [
      tenantId,
      original.school_unit_id,
      keepClassGroup ? original.class_group_id : null,
      copyName(original.name, original.vigencia, vigencia),
      original.shift,
      original.start_time,
      original.days_of_week,
      vigencia,
      original.active,
    ],
  )
  await insertSlots(q, grid!.id, original.time_slots)
}

/**
 * Duplica uma grade para a vigência indicada. A turma é mantida, a não ser que ela já
 * tenha grade na vigência de destino — aí a cópia fica sem turma para ser vinculada.
 */
export async function duplicateTimeGrid(
  id: string,
  targetVigencia: string | null,
): Promise<ActionResult & { keptClassGroup?: boolean }> {
  let keptClassGroup = false
  const result = await gridAction(async (p) => {
    const original = await db.one<GridWithSlots>(`${GRID_WITH_SLOTS} WHERE g.id = $1 AND g.tenant_id = $2`, [
      id,
      p.tenant_id,
    ])
    if (!original) return { success: false, error: 'Grade original não encontrada.' }

    const vigencia = normalizeVigencia(targetVigencia)
    await tx(p.id, async (q) => {
      keptClassGroup =
        !!original.class_group_id &&
        !(await findConflictingGrid(q, p.tenant_id, original.class_group_id, vigencia))
      await copyGrid(q, p.tenant_id, original, vigencia, keptClassGroup)
    })

    revalidatePath('/dashboard/grids')
  })
  return result.success ? { ...result, keptClassGroup } : result
}

/** Copia todas as grades de uma vigência para uma nova vigência. */
export async function duplicateVigencia(
  sourceVigencia: string | null,
  targetVigencia: string,
): Promise<ActionResult & { count?: number; skipped?: number }> {
  let count = 0
  let skipped = 0
  const result = await gridAction(async (p) => {
    const source = normalizeVigencia(sourceVigencia)
    const target = normalizeVigencia(targetVigencia)

    if (!target) return { success: false, error: 'Informe o nome da nova vigência.' }
    if (target === source) return { success: false, error: 'A nova vigência deve ser diferente da atual.' }

    const grids = await db.query<GridWithSlots>(
      `${GRID_WITH_SLOTS} WHERE g.tenant_id = $1 AND g.vigencia IS NOT DISTINCT FROM $2`,
      [p.tenant_id, source],
    )

    await tx(p.id, async (q) => {
      // Turmas que já têm grade na vigência de destino são puladas.
      const existing = await q.query<{ class_group_id: string | null }>(
        'SELECT class_group_id FROM time_grids WHERE tenant_id = $1 AND vigencia = $2',
        [p.tenant_id, target],
      )
      const taken = new Set(existing.map((g) => g.class_group_id).filter(Boolean))
      for (const g of grids) {
        if (g.class_group_id && taken.has(g.class_group_id)) {
          skipped++
          continue
        }
        await copyGrid(q, p.tenant_id, g, target, true)
        count++
      }
    })

    revalidatePath('/dashboard/grids')
  })
  return result.success ? { ...result, count, skipped } : result
}

export async function toggleGridStatus(id: string): Promise<ActionResult> {
  return editorAction(async (p) => {
    const rows = await tx(p.id, (q) =>
      q.query('UPDATE time_grids SET active = NOT active WHERE id = $1 AND tenant_id = $2 RETURNING id', [
        id,
        p.tenant_id,
      ]),
    )
    if (rows.length === 0) return { success: false, error: 'Grade não encontrada.' }
    revalidatePath('/dashboard/grids')
  })
}
