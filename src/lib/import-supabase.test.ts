// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { closeDb, db } from './db'
import { importSupabase } from './import-supabase'

const T = '00000000-0000-0000-0000-000000000001'
const P = '11111111-1111-1111-1111-111111111111'
const U = '22222222-2222-2222-2222-222222222222'

beforeAll(() => {
  process.env.DATABASE_URL = 'pglite:memory'
})
afterAll(closeDb)

const payload = {
  tenants: [{ id: T, name: 'Escola', slug: 'escola', active: true, created_at: '2026-04-24 16:08:56.187597+00', updated_at: '2026-04-24 16:08:56.187597+00' }],
  profiles: [{ id: P, tenant_id: T, name: 'Ana', email: 'ana@x.com', role: 'ADMIN', active: true, last_login_at: '2026-11-01 10:00:00+00' }],
  school_units: [{ id: U, tenant_id: T, name: 'Unidade I', code: 'U1', created_at: '2026-04-24 16:08:56+00', updated_at: '2026-05-01 09:00:00+00' }],
  audit_log: [{ id: 7, tenant_id: T, actor_id: P, action: 'INSERT', table_name: 'school_units', record_id: U, occurred_at: '2026-05-01 09:00:00+00' }],
}

describe('importSupabase', () => {
  it('recusa referência quebrada e desfaz tudo', async () => {
    const broken = { ...payload, school_units: [{ ...payload.school_units[0], tenant_id: '99999999-9999-9999-9999-999999999999' }] }
    await expect(importSupabase(broken)).rejects.toThrow(/sem referência/)
    expect((await db.one<{ n: number }>('SELECT count(*)::int AS n FROM tenants'))!.n).toBe(0)
  })

  it('copia mantendo ids e datas, sem gerar histórico, e ajusta a sequência', async () => {
    const r = await importSupabase(payload)
    expect(r.tabelas.school_units).toEqual({ origem: 1, destino: 1 })

    const unit = await db.one<{ updated_at: string }>('SELECT updated_at FROM school_units WHERE id = $1', [U])
    expect(unit!.updated_at).toBe('2026-05-01T09:00:00.000Z')
    const logs = await db.query<{ id: number }>('SELECT id FROM audit_log ORDER BY id')
    expect(logs.map((l) => l.id)).toEqual([7])

    // Depois da cópia os triggers voltam: uma gravação nova entra no histórico com id > 7.
    await db.query("UPDATE school_units SET name = 'Unidade 1' WHERE id = $1", [U])
    const last = await db.one<{ id: number }>('SELECT max(id)::int AS id FROM audit_log')
    expect(last!.id).toBeGreaterThan(7)
  })

  it('recusa rodar de novo com o banco já preenchido', async () => {
    await expect(importSupabase(payload)).rejects.toThrow(/já tem dados/)
  })

  it('recusa tabela ou coluna desconhecida', async () => {
    await expect(importSupabase({ outra: [] } as never)).rejects.toThrow(/desconhecidas/)
  })
})
