'use server'

import { revalidatePath } from 'next/cache'
import { run } from '@/lib/db'
import { editorAction, type ActionResult } from '@/lib/actions'

type GlobalRuleType =
  | 'SINGLE_UNIT_PER_DAY'
  | 'MIN_GAP_CROSS_UNIT'
  | 'BALANCE_DAILY_LOAD'
  | 'SPREAD_SUBJECT'
  | 'AVOID_LAST_SLOT'
  | 'DOUBLE_LESSONS_PREFERRED_SLOTS'
  | 'RESPECT_BASELINE'
  | 'CUSTOM'

type CreateGlobalRuleData = {
  type: GlobalRuleType
  priority: 'MANDATORY' | 'PREFERRED'
  weight: number
  params?: Record<string, unknown> | null
  description?: string | null
}

const PATH = '/dashboard/constraints/rules'

export async function createGlobalRule(data: CreateGlobalRuleData): Promise<ActionResult> {
  return editorAction(async (p) => {
    await run(
      p.id,
      `INSERT INTO global_rules (tenant_id, type, priority, weight, params, description, active)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, true)`,
      [
        p.tenant_id,
        data.type,
        data.priority,
        data.weight,
        data.params == null ? null : JSON.stringify(data.params),
        data.description ?? null,
      ],
    )
    revalidatePath(PATH)
  })
}

export async function updateGlobalRuleWeight(id: string, weight: number): Promise<ActionResult> {
  return editorAction(async (p) => {
    await run(p.id, 'UPDATE global_rules SET weight = $1 WHERE id = $2 AND tenant_id = $3', [weight, id, p.tenant_id])
    revalidatePath(PATH)
  })
}

export async function updateGlobalRuleParams(id: string, params: Record<string, unknown>): Promise<ActionResult> {
  return editorAction(async (p) => {
    await run(p.id, 'UPDATE global_rules SET params = $1::jsonb WHERE id = $2 AND tenant_id = $3', [
      JSON.stringify(params),
      id,
      p.tenant_id,
    ])
    revalidatePath(PATH)
  })
}

export async function toggleGlobalRule(id: string): Promise<ActionResult> {
  return editorAction(async (p) => {
    const rows = await run(
      p.id,
      'UPDATE global_rules SET active = NOT active WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, p.tenant_id],
    )
    if (rows.length === 0) return { success: false, error: 'Regra não encontrada.' }
    revalidatePath(PATH)
  })
}

export async function deleteGlobalRule(id: string): Promise<ActionResult> {
  return editorAction(async (p) => {
    await run(p.id, 'DELETE FROM global_rules WHERE id = $1 AND tenant_id = $2', [id, p.tenant_id])
    revalidatePath(PATH)
  })
}
