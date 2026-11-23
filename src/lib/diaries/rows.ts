import { DIARY_STATUS_INFO, monthName, type DiaryStatus } from './status'

/**
 * Monta as linhas da verificação de diários a partir dos cadastros do horário.
 *
 * Uma linha = um diário = (turma, professor, disciplina). As disciplinas que a
 * professora regente dá na própria turma viram UMA linha "Regente" (subjectId
 * nulo), como na planilha. Origem de cada linha:
 *   - assignment: vem das Atribuições atuais (o caso normal);
 *   - manual:     acrescentada à mão (substituto, diário fora da grade);
 *   - history:    não está mais atribuída, mas tem verificações no ano
 *                 (professor que saiu/foi trocado) — mantida para não sumir.
 */

export type ClassInput = {
  id: string
  name: string
  unitId: string
  homeroomTeacherId: string | null
  subjects: { subjectId: string; teacherIds: string[] }[]
}

export type CheckInput = {
  classGroupId: string
  teacherId: string
  subjectId: string | null
  month: number
  status: DiaryStatus
  notes: string | null
}

export type ExtraRowInput = {
  id: string
  classGroupId: string
  teacherId: string
  subjectId: string | null
  notes: string | null
}

export type NamedRef = { id: string; name: string; active?: boolean }

export type DiaryRowOrigin = 'assignment' | 'manual' | 'history'

export type DiaryRow = {
  key: string
  classGroupId: string
  teacherId: string
  teacherName: string
  teacherActive: boolean
  subjectId: string | null
  /** "Regente" ou o nome da disciplina. */
  subjectLabel: string
  /** Disciplinas cobertas pela linha da regente (vazio nas demais). */
  regenteSubjects: string[]
  origin: DiaryRowOrigin
  extraRowId: string | null
  extraNotes: string | null
}

export type CellValue = { status: DiaryStatus; notes: string | null }

export function rowKey(classGroupId: string, teacherId: string, subjectId: string | null): string {
  return `${classGroupId}|${teacherId}|${subjectId ?? 'regente'}`
}

export function cellKey(rowKeyValue: string, month: number): string {
  return `${rowKeyValue}#${month}`
}

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

export function buildDiaryRows(input: {
  classes: ClassInput[]
  teachers: NamedRef[]
  subjects: NamedRef[]
  checks: CheckInput[]
  extraRows: ExtraRowInput[]
}): Map<string, DiaryRow[]> {
  const teacherById = new Map(input.teachers.map((t) => [t.id, t]))
  const subjectById = new Map(input.subjects.map((s) => [s.id, s]))
  const result = new Map<string, DiaryRow[]>()

  function makeRow(
    classGroupId: string,
    teacherId: string,
    subjectId: string | null,
    origin: DiaryRowOrigin,
  ): DiaryRow {
    const teacher = teacherById.get(teacherId)
    return {
      key: rowKey(classGroupId, teacherId, subjectId),
      classGroupId,
      teacherId,
      teacherName: teacher?.name ?? 'Professor removido',
      teacherActive: teacher?.active ?? true,
      subjectId,
      subjectLabel: subjectId ? (subjectById.get(subjectId)?.name ?? 'Disciplina removida') : 'Regente',
      regenteSubjects: [],
      origin,
      extraRowId: null,
      extraNotes: null,
    }
  }

  const classIds = new Set(input.classes.map((c) => c.id))

  for (const cls of input.classes) {
    const rows = new Map<string, DiaryRow>()

    for (const cs of cls.subjects) {
      for (const teacherId of cs.teacherIds) {
        const isRegente = cls.homeroomTeacherId !== null && teacherId === cls.homeroomTeacherId
        const subjectId = isRegente ? null : cs.subjectId
        const key = rowKey(cls.id, teacherId, subjectId)
        let row = rows.get(key)
        if (!row) {
          row = makeRow(cls.id, teacherId, subjectId, 'assignment')
          rows.set(key, row)
        }
        if (isRegente) {
          const name = subjectById.get(cs.subjectId)?.name
          if (name && !row.regenteSubjects.includes(name)) row.regenteSubjects.push(name)
        }
      }
    }

    result.set(cls.id, [...rows.values()])
  }

  for (const extra of input.extraRows) {
    if (!classIds.has(extra.classGroupId)) continue
    const rows = result.get(extra.classGroupId)!
    const key = rowKey(extra.classGroupId, extra.teacherId, extra.subjectId)
    let row = rows.find((r) => r.key === key)
    if (!row) {
      row = makeRow(extra.classGroupId, extra.teacherId, extra.subjectId, 'manual')
      rows.push(row)
    }
    row.extraRowId = extra.id
    row.extraNotes = extra.notes
  }

  for (const check of input.checks) {
    if (!classIds.has(check.classGroupId)) continue
    const rows = result.get(check.classGroupId)!
    const key = rowKey(check.classGroupId, check.teacherId, check.subjectId)
    if (!rows.some((r) => r.key === key)) {
      rows.push(makeRow(check.classGroupId, check.teacherId, check.subjectId, 'history'))
    }
  }

  for (const rows of result.values()) {
    for (const row of rows) row.regenteSubjects.sort(collator.compare)
    rows.sort(compareRows)
  }

  return result
}

const ORIGIN_ORDER: Record<DiaryRowOrigin, number> = { assignment: 0, manual: 0, history: 1 }

/** Regente primeiro; depois por disciplina e professor; históricos no fim. */
function compareRows(a: DiaryRow, b: DiaryRow): number {
  if (ORIGIN_ORDER[a.origin] !== ORIGIN_ORDER[b.origin]) {
    return ORIGIN_ORDER[a.origin] - ORIGIN_ORDER[b.origin]
  }
  const aReg = a.subjectId === null ? 0 : 1
  const bReg = b.subjectId === null ? 0 : 1
  if (aReg !== bReg) return aReg - bReg
  return collator.compare(a.subjectLabel, b.subjectLabel) || collator.compare(a.teacherName, b.teacherName)
}

export function checksToCells(checks: CheckInput[]): Map<string, CellValue> {
  const cells = new Map<string, CellValue>()
  for (const c of checks) {
    cells.set(cellKey(rowKey(c.classGroupId, c.teacherId, c.subjectId), c.month), {
      status: c.status,
      notes: c.notes,
    })
  }
  return cells
}

export type MonthSummary = {
  total: number
  unchecked: number
  byStatus: Record<DiaryStatus, number>
  ok: number
  pending: number
  na: number
}

export function summarizeMonth(
  rows: DiaryRow[],
  cells: Map<string, CellValue>,
  month: number,
): MonthSummary {
  const byStatus = Object.fromEntries(
    Object.keys(DIARY_STATUS_INFO).map((s) => [s, 0]),
  ) as Record<DiaryStatus, number>
  const summary: MonthSummary = { total: rows.length, unchecked: 0, byStatus, ok: 0, pending: 0, na: 0 }

  for (const row of rows) {
    const cell = cells.get(cellKey(row.key, month))
    if (!cell) {
      summary.unchecked++
      continue
    }
    byStatus[cell.status]++
    summary[DIARY_STATUS_INFO[cell.status].kind]++
  }
  return summary
}

export type TeacherPending = {
  teacherId: string
  teacherName: string
  items: { row: DiaryRow; className: string; status: DiaryStatus; notes: string | null }[]
}

/** Pendências do mês agrupadas por professor (para cobrança). */
export function pendingByTeacher(
  rows: DiaryRow[],
  cells: Map<string, CellValue>,
  month: number,
  classNameById: Map<string, string>,
): TeacherPending[] {
  const byTeacher = new Map<string, TeacherPending>()
  for (const row of rows) {
    const cell = cells.get(cellKey(row.key, month))
    if (!cell || DIARY_STATUS_INFO[cell.status].kind !== 'pending') continue
    let entry = byTeacher.get(row.teacherId)
    if (!entry) {
      entry = { teacherId: row.teacherId, teacherName: row.teacherName, items: [] }
      byTeacher.set(row.teacherId, entry)
    }
    entry.items.push({
      row,
      className: classNameById.get(row.classGroupId) ?? '',
      status: cell.status,
      notes: cell.notes,
    })
  }
  const list = [...byTeacher.values()]
  for (const t of list) {
    t.items.sort(
      (a, b) => collator.compare(a.className, b.className) || collator.compare(a.row.subjectLabel, b.row.subjectLabel),
    )
  }
  return list.sort((a, b) => collator.compare(a.teacherName, b.teacherName))
}

/** Texto pronto para mandar ao professor (WhatsApp / e-mail). */
export function pendingMessage(pending: TeacherPending, month: number, year: number): string {
  const lines = pending.items.map((i) => {
    const what = DIARY_STATUS_INFO[i.status].label.toLowerCase()
    const note = i.notes ? ` (${i.notes})` : ''
    return `• ${i.className} — ${i.row.subjectLabel}: ${what}${note}`
  })
  return [
    `Olá, ${pending.teacherName}! Na verificação dos diários de ${monthName(month).toLowerCase()}/${year} ficaram estas pendências:`,
    ...lines,
    'Por favor, regularize assim que possível. Obrigado!',
  ].join('\n')
}
