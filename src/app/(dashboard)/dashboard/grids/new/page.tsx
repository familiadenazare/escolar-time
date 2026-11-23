import { redirect } from 'next/navigation'
import { getEditorProfile } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { GridForm } from '@/components/grids/grid-form'

async function loadVigencias(tenantId: string) {
  const rows = await db.query<{ vigencia: string }>(
    'SELECT DISTINCT vigencia FROM time_grids WHERE tenant_id = $1 AND vigencia IS NOT NULL',
    [tenantId],
  )
  return rows.map((r) => r.vigencia).sort((a, b) => b.localeCompare(a, 'pt-BR', { numeric: true }))
}

interface NewGridPageProps {
  searchParams: Promise<{ vigencia?: string }>
}

export default async function NewGridPage({ searchParams }: NewGridPageProps) {
  const editor = await getEditorProfile()
  if (!editor) redirect('/dashboard/grids')

  const { vigencia } = await searchParams
  const [classGroups, vigencias] = await Promise.all([
    db.query<{ id: string; name: string; school_units: { id: string; name: string } }>(
      `SELECT cg.id, cg.name, json_build_object('id', su.id, 'name', su.name) AS school_units
         FROM class_groups cg JOIN school_units su ON su.id = cg.school_unit_id
        WHERE cg.tenant_id = $1 AND cg.active
        ORDER BY cg.name`,
      [editor.tenant_id],
    ),
    loadVigencias(editor.tenant_id),
  ])

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Nova Grade Horária</h1>
        <p className="text-slate text-sm mt-1">
          Configure os horários de aulas e intervalos para cada dia da semana.
        </p>
      </div>
      <GridForm
        classGroups={classGroups}
        vigencias={vigencias}
        defaultVigencia={vigencia ?? vigencias[0] ?? ''}
      />
    </div>
  )
}
