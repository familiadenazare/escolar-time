import { redirect } from 'next/navigation'
import { getEditorProfile } from '@/lib/auth/session'
import { listActiveSubjects, listActiveTeachers, listActiveUnits } from '@/lib/queries'
import { ConstraintWizard } from '@/components/constraints/constraint-wizard'

interface NewConstraintPageProps {
  searchParams: Promise<{ teacherId?: string }>
}

export default async function NewConstraintPage({ searchParams }: NewConstraintPageProps) {
  const editor = await getEditorProfile()
  if (!editor) redirect('/dashboard/constraints')

  const { teacherId } = await searchParams

  const [teachers, units, subjects] = await Promise.all([
    listActiveTeachers(editor.tenant_id),
    listActiveUnits(editor.tenant_id),
    listActiveSubjects(editor.tenant_id),
  ])

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Nova Restrição</h1>
        <p className="text-slate text-sm mt-1">
          Configure as preferências e limitações de horário de um professor.
        </p>
      </div>
      <ConstraintWizard
        teachers={teachers}
        units={units}
        subjects={subjects.map(({ id, name }) => ({ id, name }))}
        initialTeacherId={teacherId}
      />
    </div>
  )
}
