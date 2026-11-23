import { notFound, redirect } from 'next/navigation'
import { getEditorProfile } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { TeacherForm } from '@/components/teachers/teacher-form'

export default async function EditTeacherPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const editor = await getEditorProfile()
  if (!editor) redirect('/dashboard/teachers')

  const { id } = await params
  const teacher = await db.one<{ id: string; name: string; active: boolean }>(
    'SELECT id, name, active FROM teachers WHERE id = $1 AND tenant_id = $2',
    [id, editor.tenant_id],
  )

  if (!teacher) notFound()

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Editar Professor</h1>
        <p className="text-slate text-sm mt-1">Altere os dados do professor.</p>
      </div>
      <TeacherForm initialData={teacher} />
    </div>
  )
}
