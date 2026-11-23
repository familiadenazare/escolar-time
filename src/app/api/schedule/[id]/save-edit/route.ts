import { NextResponse } from 'next/server'
import { z } from 'zod'
import { tx } from '@/lib/db'
import { validateEditedSchedule } from '@/engine/index'
import {
  badRequest,
  insertScheduleEntries,
  lessonsSchema,
  loadEditableSchedule,
  parseJson,
  scheduleVigencia,
} from '@/lib/schedule-edit'

const bodySchema = z.object({
  /** replace = o original vai para o histórico de apagados; copy = o original permanece. */
  mode: z.enum(['replace', 'copy']),
  name: z.string().trim().max(200).optional(),
  entries: lessonsSchema,
})

/**
 * Salva uma edição manual como um NOVO horário. A validação roda de novo aqui:
 * o cliente não é confiável e os cadastros podem ter mudado desde a última validação.
 * Violações obrigatórias bloqueiam o salvamento (422).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const loaded = await loadEditableSchedule(id)
  if (!loaded.ok) return loaded.response
  const { userId, tenantId, schedule: original } = loaded

  const parsed = bodySchema.safeParse(await parseJson(request))
  if (!parsed.success) return badRequest(parsed.error)
  const { mode, entries } = parsed.data

  const baselineScheduleId = original.config_snapshot?.baselineScheduleId ?? null
  const vigencia = await scheduleVigencia(original)

  let result
  try {
    result = await validateEditedSchedule(
      tenantId,
      entries,
      baselineScheduleId ?? undefined,
      original.baseline_weight,
      vigencia
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido.'
    return NextResponse.json({ error: `Erro ao validar: ${message}` }, { status: 500 })
  }

  if (!result.valid) {
    return NextResponse.json(
      { error: 'O horário tem violações obrigatórias e não pode ser salvo.', validation: result },
      { status: 422 }
    )
  }

  const name =
    parsed.data.name ||
    (mode === 'replace' ? original.name : `${original.name} (editado)`)

  // Novo horário + aulas + (na substituição) baseline e aposentadoria do original:
  // tudo numa transação — ou fica tudo gravado, ou nada.
  try {
    const createdId = await tx(userId, async (q) => {
      const created = await q.one<{ id: string }>(
        `INSERT INTO generated_schedules
           (tenant_id, name, status, score, violations, baseline_weight, created_by, config_snapshot)
         VALUES ($1, $2, 'COMPLETED', $3, $4::jsonb, $5, $6, $7::jsonb)
         RETURNING id`,
        [
          tenantId,
          name,
          result.score,
          JSON.stringify(result.softViolations ?? null),
          original.baseline_weight,
          userId,
          JSON.stringify({
            manualEdit: true,
            editedFrom: original.id,
            editMode: mode,
            baselineScheduleId,
            ...(vigencia !== undefined ? { vigencia } : {}),
            warnings: [],
          }),
        ],
      )
      const newId = created!.id

      await insertScheduleEntries(q, newId, entries)

      if (mode === 'replace') {
        if (original.is_baseline) {
          await q.query('UPDATE generated_schedules SET is_baseline = false WHERE tenant_id = $1 AND is_baseline', [
            tenantId,
          ])
          await q.query('UPDATE generated_schedules SET is_baseline = true WHERE id = $1', [newId])
        }
        await q.query(
          `UPDATE generated_schedules
              SET deleted_at = now(), deleted_by = $1, deleted_reason = 'replaced_by_edit',
                  replaced_by = $2, is_baseline = false
            WHERE id = $3 AND tenant_id = $4`,
          [userId, newId, original.id, tenantId],
        )
      }
      return newId
    })

    return NextResponse.json({ scheduleId: createdId, score: result.score })
  } catch (e) {
    return NextResponse.json(
      { error: `Erro ao salvar o horário editado: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    )
  }
}
