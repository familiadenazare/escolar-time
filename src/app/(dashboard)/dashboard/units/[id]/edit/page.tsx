import { notFound, redirect } from 'next/navigation'
import { getEditorProfile } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { UnitForm } from '@/components/units/unit-form'

export default async function EditUnitPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const editor = await getEditorProfile()
  if (!editor) redirect('/dashboard/units')

  const { id } = await params
  const unit = await db.one<{ id: string; name: string; code: string; address: string | null; active: boolean }>(
    'SELECT id, name, code, address, active FROM school_units WHERE id = $1 AND tenant_id = $2',
    [id, editor.tenant_id],
  )

  if (!unit) notFound()

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Editar Unidade Escolar</h1>
        <p className="text-slate text-sm mt-1">Altere os dados da unidade.</p>
      </div>
      <UnitForm initialData={unit} />
    </div>
  )
}
