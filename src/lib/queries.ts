import { db } from '@/lib/db'

export type NamedRow = { id: string; name: string }

/** Unidades ativas (listas de seleção). */
export function listActiveUnits(tenantId: string) {
  return db.query<NamedRow>('SELECT id, name FROM school_units WHERE tenant_id = $1 AND active ORDER BY name', [
    tenantId,
  ])
}

/** Professores ativos (listas de seleção). */
export function listActiveTeachers(tenantId: string) {
  return db.query<NamedRow>('SELECT id, name FROM teachers WHERE tenant_id = $1 AND active ORDER BY name', [tenantId])
}

/** Disciplinas ativas (listas de seleção). */
export function listActiveSubjects(tenantId: string) {
  return db.query<NamedRow & { code: string; color: string }>(
    'SELECT id, name, code, color FROM subjects WHERE tenant_id = $1 AND active ORDER BY name',
    [tenantId],
  )
}
