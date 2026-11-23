import { db } from '@/lib/db'
import { requireProfile } from '@/lib/auth/session'
import { GlobalRulesConfig } from '@/components/rules/global-rules-config'

export default async function GlobalRulesPage() {
  const { tenant_id } = await requireProfile()

  const rules = await db.query(
    `SELECT id, type, priority, weight, params, description, active
       FROM global_rules WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenant_id],
  )

  return <GlobalRulesConfig rules={rules as Parameters<typeof GlobalRulesConfig>[0]['rules']} />
}
