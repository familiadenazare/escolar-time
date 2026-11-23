import { db } from '@/lib/db'
import { requireProfile } from '@/lib/auth/session'
import { isDiaryStatus, type DiaryStatus } from '@/lib/diaries/status'
import type { CheckInput, ClassInput, ExtraRowInput, ReadingInput } from '@/lib/diaries/rows'
import { DiariesBoard } from '@/components/diaries/diaries-board'

export default async function DiariesPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string }>
}) {
  const { tenant_id: tenantId } = await requireProfile()

  // Anos letivos = anos das turmas cadastradas.
  const yearRows = await db.query<{ year: number }>(
    'SELECT DISTINCT year FROM class_groups WHERE tenant_id = $1 ORDER BY year DESC',
    [tenantId],
  )
  const years = yearRows.map((r) => r.year)

  const currentYear = new Date().getFullYear()
  const requested = Number.parseInt((await searchParams).ano ?? '', 10)
  const year = years.includes(requested)
    ? requested
    : years.includes(currentYear)
      ? currentYear
      : (years[0] ?? currentYear)

  let loadError: string | null = null
  const fail = <T,>(e: unknown, fallback: T): T => {
    loadError ??= e instanceof Error ? e.message : String(e)
    return fallback
  }

  const [units, classes, teachers, subjects, checks, extraRows] = await Promise.all([
    db.query<{ id: string; name: string; code: string }>(
      'SELECT id, name, code FROM school_units WHERE tenant_id = $1 AND active ORDER BY name',
      [tenantId],
    ),
    db
      .query<ClassInput>(
        `SELECT cg.id, cg.name, cg.school_unit_id AS "unitId", cg.homeroom_teacher_id AS "homeroomTeacherId",
                coalesce((
                  SELECT json_agg(json_build_object(
                    'subjectId', cs.subject_id,
                    'teacherIds', coalesce((
                      SELECT json_agg(ta.teacher_id) FROM teaching_assignments ta WHERE ta.class_subject_id = cs.id), '[]')))
                    FROM class_subjects cs WHERE cs.class_group_id = cg.id), '[]') AS subjects
           FROM class_groups cg
          WHERE cg.tenant_id = $1 AND cg.year = $2 AND cg.active`,
        [tenantId, year],
      )
      .catch((e) => fail(e, [] as ClassInput[])),
    db.query<{ id: string; name: string; active: boolean }>(
      'SELECT id, name, active FROM teachers WHERE tenant_id = $1 ORDER BY name',
      [tenantId],
    ),
    db.query<{ id: string; name: string; active: boolean }>(
      'SELECT id, name, active FROM subjects WHERE tenant_id = $1 ORDER BY name',
      [tenantId],
    ),
    db
      .query<{
        classGroupId: string
        teacherId: string
        subjectId: string | null
        month: number
        status: string
        notes: string | null
      }>(
        `SELECT class_group_id AS "classGroupId", teacher_id AS "teacherId", subject_id AS "subjectId",
                month, status, notes
           FROM diary_checks WHERE tenant_id = $1 AND year = $2`,
        [tenantId, year],
      )
      .catch((e) => fail(e, [])),
    db
      .query<ExtraRowInput>(
        `SELECT id, class_group_id AS "classGroupId", teacher_id AS "teacherId", subject_id AS "subjectId", notes
           FROM diary_extra_rows WHERE tenant_id = $1 AND year = $2`,
        [tenantId, year],
      )
      .catch((e) => fail(e, [] as ExtraRowInput[])),
  ])

  // Leituras do robô no Escolar, já com os vínculos (só as ligadas a turma e disciplina daqui).
  const [readings, linkStats] = await Promise.all([
    db
      .query<ReadingInput>(
        `SELECT lt.local_id AS "classGroupId", ld.local_id AS "subjectId", lp.local_id AS "teacherId",
                r.month, r.lessons, r.planned, r.given, r.read_at AS "readAt", ld.name AS "emDisciplina"
           FROM diary_readings r
           JOIN em_links lt ON lt.tenant_id = r.tenant_id AND lt.kind = 'turma' AND lt.em_key = r.em_turma_key
                           AND lt.local_id IS NOT NULL AND NOT lt.ignored
           JOIN em_links ld ON ld.tenant_id = r.tenant_id AND ld.kind = 'disciplina' AND ld.em_key = r.em_disciplina_key
                           AND ld.local_id IS NOT NULL AND NOT ld.ignored
           LEFT JOIN em_links lp ON lp.tenant_id = r.tenant_id AND lp.kind = 'professor' AND lp.em_key = r.em_professor_key
                                AND NOT lp.ignored
          WHERE r.tenant_id = $1 AND r.year = $2`,
        [tenantId, year],
      )
      .catch((e) => fail(e, [] as ReadingInput[])),
    db
      .one<{ pending: number; last_read: string | null }>(
        `SELECT (SELECT count(*)::int FROM em_links WHERE tenant_id = $1 AND local_id IS NULL AND NOT ignored) AS pending,
                (SELECT max(read_at) FROM diary_readings WHERE tenant_id = $1) AS last_read`,
        [tenantId],
      )
      .catch((e) => fail(e, null)),
  ])

  const validChecks: CheckInput[] = checks
    .filter((c) => isDiaryStatus(c.status))
    .map((c) => ({ ...c, status: c.status as DiaryStatus }))

  return (
    <DiariesBoard
      key={year}
      year={year}
      years={years.length ? years : [year]}
      units={units}
      classes={classes}
      teachers={teachers}
      subjects={subjects}
      checks={validChecks}
      extraRows={extraRows}
      readings={readings}
      pendingLinks={linkStats?.pending ?? 0}
      lastRead={linkStats?.last_read ?? null}
      loadError={loadError}
    />
  )
}
