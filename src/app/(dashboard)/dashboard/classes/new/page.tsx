import { redirect } from 'next/navigation'
import { getEditorProfile } from '@/lib/auth/session'
import { listActiveTeachers, listActiveUnits } from '@/lib/queries'
import { ClassForm } from '@/components/classes/class-form'

export default async function NewClassPage() {
  const editor = await getEditorProfile()
  if (!editor) redirect('/dashboard/classes')

  const [units, teachers] = await Promise.all([
    listActiveUnits(editor.tenant_id),
    listActiveTeachers(editor.tenant_id),
  ])

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Nova Turma</h1>
        <p className="text-slate text-sm mt-1">Cadastre uma nova turma.</p>
      </div>
      <ClassForm units={units} teachers={teachers} />
    </div>
  )
}
