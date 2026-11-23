import { notFound, redirect } from 'next/navigation'
import { getEditorProfile } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { listActiveTeachers, listActiveUnits } from '@/lib/queries'
import { ClassForm } from '@/components/classes/class-form'

export default async function EditClassPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const editor = await getEditorProfile()
  if (!editor) redirect('/dashboard/classes')

  const { id } = await params

  const [classGroup, units, teachers] = await Promise.all([
    db.one<{
      id: string
      name: string
      shift: 'MORNING' | 'AFTERNOON' | 'EVENING'
      year: number
      active: boolean
      school_unit_id: string
      homeroom_teacher_id: string | null
    }>(
      `SELECT id, name, shift, year, active, school_unit_id, homeroom_teacher_id
         FROM class_groups WHERE id = $1 AND tenant_id = $2`,
      [id, editor.tenant_id],
    ),
    listActiveUnits(editor.tenant_id),
    listActiveTeachers(editor.tenant_id),
  ])

  if (!classGroup) notFound()

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Editar Turma</h1>
        <p className="text-slate text-sm mt-1">Altere os dados da turma.</p>
      </div>
      <ClassForm initialData={classGroup} units={units} teachers={teachers} />
    </div>
  )
}
