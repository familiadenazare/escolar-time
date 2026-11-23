// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { closeDb, db, isUniqueViolation, run, tx } from './index'

const TENANT = '00000000-0000-0000-0000-000000000001'

beforeAll(() => {
  process.env.DATABASE_URL = 'pglite:memory'
})
afterAll(closeDb)

describe('banco (PGlite + migrations)', () => {
  it('aplica as migrations e grava com autor no histórico', async () => {
    await db.query("INSERT INTO tenants (id, name, slug) VALUES ($1, 'Escola', 'escola')", [TENANT])
    const [admin] = await db.query<{ id: string }>(
      "INSERT INTO profiles (tenant_id, name, email, role) VALUES ($1, 'Ana Admin', 'ana@x.com', 'ADMIN') RETURNING id",
      [TENANT],
    )

    const [unit] = await run<{ id: string; created_at: string }>(
      admin.id,
      "INSERT INTO school_units (tenant_id, name, code) VALUES ($1, 'Unidade I', 'U1') RETURNING id, created_at",
      [TENANT],
    )
    expect(unit.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/)

    const log = await db.one<{ actor_name: string; action: string; record_label: string; id: number }>(
      "SELECT id, actor_name, action, record_label FROM audit_log WHERE table_name = 'school_units'",
    )
    expect(log).toMatchObject({ actor_name: 'Ana Admin', action: 'INSERT', record_label: 'Unidade I' })
    expect(typeof log!.id).toBe('number')
  })

  it('transação desfaz tudo em caso de erro', async () => {
    await expect(
      tx(null, async (q) => {
        await q.query("INSERT INTO subjects (tenant_id, name, code) VALUES ($1, 'Latim', 'LAT')", [TENANT])
        await q.query("INSERT INTO school_units (tenant_id, name, code) VALUES ($1, 'Dup', 'U1')", [TENANT])
      }),
    ).rejects.toSatisfy(isUniqueViolation)
    expect(await db.one("SELECT 1 FROM subjects WHERE code = 'LAT'")).toBeNull()
  })

  it('gravação sem autor fica como Sistema e diários auditam com rótulo', async () => {
    const t = await db.one<{ id: string }>("INSERT INTO teachers (tenant_id, name) VALUES ($1, 'Sarah') RETURNING id", [TENANT])
    const u = await db.one<{ id: string }>('SELECT id FROM school_units LIMIT 1')
    const c = await db.one<{ id: string }>(
      "INSERT INTO class_groups (tenant_id, school_unit_id, name, year) VALUES ($1, $2, '3º Ano A', 2026) RETURNING id",
      [TENANT, u!.id],
    )
    await db.query(
      "INSERT INTO diary_checks (tenant_id, class_group_id, teacher_id, year, month, status) VALUES ($1, $2, $3, 2026, 11, 'ASSINADO')",
      [TENANT, c!.id, t!.id],
    )
    const log = await db.one<{ actor_id: string | null; record_label: string }>(
      "SELECT actor_id, record_label FROM audit_log WHERE table_name = 'diary_checks'",
    )
    expect(log).toEqual({ actor_id: null, record_label: '3º Ano A · Regente · Sarah · 11/2026' })
  })
})
