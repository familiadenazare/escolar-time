'use server'

import { revalidatePath } from 'next/cache'
import { db, run } from '@/lib/db'
import { editorAction, type ActionResult } from '@/lib/actions'
import { getSessionProfile } from '@/lib/auth/session'
import { listActiveSubjects, listActiveTeachers } from '@/lib/queries'

/**
 * Leitura da tela de Atribuições (antes feita direto do navegador no Supabase):
 * turmas da unidade com disciplinas e professor de cada uma, e as listas de
 * professores e disciplinas ativos.
 */
export async function loadAssignmentsData(unitId: string) {
  const profile = await getSessionProfile()
  if (!profile) return { groups: [], teachers: [], subjects: [] }

  const [groups, teachers, subjects] = await Promise.all([
    db.query(
      `SELECT cg.id, cg.name, cg.shift, cg.year,
              coalesce((
                SELECT json_agg(json_build_object(
                  'id', cs.id, 'weekly_lessons', cs.weekly_lessons, 'allow_double_lesson', cs.allow_double_lesson,
                  'subjects', json_build_object('id', s.id, 'name', s.name, 'code', s.code, 'color', s.color),
                  'teaching_assignments', coalesce((
                    SELECT json_agg(json_build_object(
                      'id', ta.id, 'teacher_id', ta.teacher_id,
                      'teachers', json_build_object('id', t.id, 'name', t.name)))
                      FROM teaching_assignments ta JOIN teachers t ON t.id = ta.teacher_id
                     WHERE ta.class_subject_id = cs.id), '[]')))
                  FROM class_subjects cs JOIN subjects s ON s.id = cs.subject_id
                 WHERE cs.class_group_id = cg.id), '[]') AS class_subjects
         FROM class_groups cg
        WHERE cg.school_unit_id = $1 AND cg.tenant_id = $2
        ORDER BY cg.name`,
      [unitId, profile.tenant_id],
    ),
    listActiveTeachers(profile.tenant_id),
    listActiveSubjects(profile.tenant_id),
  ])

  return { groups, teachers, subjects }
}

export async function assignTeacher(classSubjectId: string, teacherId: string): Promise<ActionResult> {
  return editorAction(async (p) => {
    await run(
      p.id,
      `INSERT INTO teaching_assignments (class_subject_id, teacher_id)
       SELECT cs.id, $2 FROM class_subjects cs JOIN class_groups cg ON cg.id = cs.class_group_id
        WHERE cs.id = $1 AND cg.tenant_id = $3
       ON CONFLICT (class_subject_id) DO UPDATE SET teacher_id = EXCLUDED.teacher_id`,
      [classSubjectId, teacherId, p.tenant_id],
    )
    revalidatePath('/dashboard/assignments')
  })
}

export async function removeAssignment(classSubjectId: string): Promise<ActionResult> {
  return editorAction(
    async (p) => {
      await run(
        p.id,
        `DELETE FROM teaching_assignments ta USING class_subjects cs, class_groups cg
          WHERE ta.class_subject_id = $1 AND cs.id = ta.class_subject_id
            AND cg.id = cs.class_group_id AND cg.tenant_id = $2`,
        [classSubjectId, p.tenant_id],
      )
      revalidatePath('/dashboard/assignments')
    },
    { foreignKey: 'Esta atribuição é usada em horários gerados e não pode ser removida.' },
  )
}

export async function addSubjectToClass(
  classGroupId: string,
  subjectId: string,
  weeklyLessons: number,
  allowDoubleLesson: boolean
): Promise<ActionResult> {
  return editorAction(
    async (p) => {
      await run(
        p.id,
        `INSERT INTO class_subjects (class_group_id, subject_id, weekly_lessons, allow_double_lesson)
         SELECT cg.id, $2, $3, $4 FROM class_groups cg WHERE cg.id = $1 AND cg.tenant_id = $5`,
        [classGroupId, subjectId, weeklyLessons, allowDoubleLesson, p.tenant_id],
      )
      revalidatePath('/dashboard/assignments')
    },
    { unique: 'Esta disciplina já está na turma.' },
  )
}

export async function removeSubjectFromClass(classSubjectId: string): Promise<ActionResult> {
  return editorAction(
    async (p) => {
      await run(
        p.id,
        `DELETE FROM class_subjects cs USING class_groups cg
          WHERE cs.id = $1 AND cg.id = cs.class_group_id AND cg.tenant_id = $2`,
        [classSubjectId, p.tenant_id],
      )
      revalidatePath('/dashboard/assignments')
    },
    { foreignKey: 'Esta disciplina é usada em horários gerados e não pode ser removida da turma.' },
  )
}
