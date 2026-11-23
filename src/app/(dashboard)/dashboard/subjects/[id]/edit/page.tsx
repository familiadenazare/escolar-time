import { notFound, redirect } from 'next/navigation'
import { getEditorProfile } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { SubjectForm } from '@/components/subjects/subject-form'

export default async function EditSubjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const editor = await getEditorProfile()
  if (!editor) redirect('/dashboard/subjects')

  const { id } = await params
  const subject = await db.one<{ id: string; name: string; code: string; color: string; active: boolean }>(
    'SELECT id, name, code, color, active FROM subjects WHERE id = $1 AND tenant_id = $2',
    [id, editor.tenant_id],
  )

  if (!subject) notFound()

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Editar Disciplina</h1>
        <p className="text-slate text-sm mt-1">Altere os dados da disciplina.</p>
      </div>
      <SubjectForm initialData={subject} />
    </div>
  )
}
