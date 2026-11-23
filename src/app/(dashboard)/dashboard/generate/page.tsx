import { redirect } from 'next/navigation'
import { getEditorProfile } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { GenerateScheduleForm } from '@/components/schedule/generate-schedule-form'

export default async function GeneratePage() {
  const editor = await getEditorProfile()
  if (!editor) redirect('/dashboard/schedules')

  const [schedules, grids] = await Promise.all([
    db.query<{ id: string; name: string; created_at: string; score: number | null; status: string }>(
      `SELECT id, name, created_at, score, status FROM generated_schedules
        WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [editor.tenant_id],
    ),
    db.query<{ vigencia: string | null }>('SELECT vigencia FROM time_grids WHERE tenant_id = $1 AND active', [
      editor.tenant_id,
    ]),
  ])

  const vigencias = [
    ...new Set(grids.map((g) => g.vigencia).filter((v): v is string => !!v)),
  ].sort((a, b) => b.localeCompare(a, 'pt-BR', { numeric: true }))
  const hasNoVigencia = grids.some((g) => !g.vigencia)

  return (
    <GenerateScheduleForm
      existingSchedules={schedules}
      vigencias={vigencias}
      hasNoVigencia={hasNoVigencia}
    />
  )
}
