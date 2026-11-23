import { NextRequest, NextResponse } from 'next/server'
import { requireEditor } from '@/lib/auth/api'
import { run, tx } from '@/lib/db'
import { insertScheduleEntries } from '@/lib/schedule-edit'
import { generateSchedule } from '@/engine/index'

// O solver tem timeout interno de 25s; damos folga para carga + otimização.
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const auth = await requireEditor()
  if (!auth.ok) return auth.response
  const { user } = auth
  const tenantId = user.tenant_id

  let body: {
    name?: string
    baselineScheduleId?: string
    baselineWeight?: number
    /** Vigência das grades; null = grades sem vigência; ausente = a mais recente. */
    vigencia?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 })
  }

  const { name, baselineScheduleId, baselineWeight } = body
  const vigencia =
    body.vigencia === undefined ? undefined : body.vigencia?.trim() ? body.vigencia.trim() : null

  if (!name || name.trim() === '') {
    return NextResponse.json({ error: 'O nome do horário é obrigatório.' }, { status: 400 })
  }

  let scheduleId: string
  try {
    const [created] = await run<{ id: string }>(
      user.id,
      `INSERT INTO generated_schedules (tenant_id, name, status, created_by, baseline_weight)
       VALUES ($1, $2, 'GENERATING', $3, $4) RETURNING id`,
      [tenantId, name.trim(), user.id, baselineWeight ?? 0.7],
    )
    scheduleId = created.id
  } catch {
    return NextResponse.json({ error: 'Erro ao criar registro de horário.' }, { status: 500 })
  }

  const markFailed = (violations: unknown[], snapshot?: Record<string, unknown>) =>
    run(
      user.id,
      `UPDATE generated_schedules
          SET status = 'FAILED', violations = $1::jsonb, config_snapshot = coalesce($2::jsonb, config_snapshot)
        WHERE id = $3`,
      [JSON.stringify(violations), snapshot ? JSON.stringify(snapshot) : null, scheduleId],
    )

  try {
    const result = await generateSchedule(tenantId, {
      name: name.trim(),
      baselineScheduleId,
      baselineWeight: baselineWeight ?? 0.7,
      vigencia,
    })

    if (result.status === 'INFEASIBLE') {
      await markFailed(result.validationErrors ?? [], {
        warnings: result.warnings ?? [],
        stats: result.stats,
        ...(vigencia !== undefined ? { vigencia } : {}),
      })

      return NextResponse.json({
        scheduleId,
        status: 'FAILED',
        errors: result.validationErrors ?? [],
        warnings: result.warnings ?? [],
      })
    }

    // SUCCESS ou PARTIAL — grava as aulas alocadas e conclui, tudo de uma vez.
    const partial = result.status === 'PARTIAL'
    try {
      await tx(user.id, async (q) => {
        await insertScheduleEntries(q, scheduleId, result.solution?.entries ?? [])
        await q.query(
          `UPDATE generated_schedules
              SET status = 'COMPLETED', score = $1, violations = $2::jsonb, config_snapshot = $3::jsonb
            WHERE id = $4`,
          [
            result.score,
            JSON.stringify(result.violations ?? null),
            JSON.stringify({
              partial,
              stats: result.stats,
              warnings: result.warnings ?? [],
              baselineSimilarity: result.baselineSimilarity,
              baselineScheduleId: baselineScheduleId ?? null,
              ...(vigencia !== undefined ? { vigencia } : {}),
            }),
            scheduleId,
          ],
        )
      })
    } catch (e) {
      const message = `Erro ao gravar as aulas do horário: ${e instanceof Error ? e.message : String(e)}`
      await markFailed([message])
      return NextResponse.json({ scheduleId, status: 'FAILED', errors: [message] })
    }

    return NextResponse.json({
      scheduleId,
      status: 'COMPLETED',
      partial,
      score: result.score,
      warnings: result.warnings ?? [],
      stats: result.stats,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido.'
    await markFailed([message]).catch(() => {})

    console.error('generateSchedule error:', err)
    return NextResponse.json(
      { scheduleId, status: 'FAILED', errors: [`Erro interno ao gerar horário: ${message}`] },
      { status: 500 }
    )
  }
}
