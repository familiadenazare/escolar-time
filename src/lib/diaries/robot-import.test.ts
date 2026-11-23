// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { closeDb, db } from '@/lib/db'
import { importRobotReadings, robotPayloadSchema } from './robot-import'

const T = '00000000-0000-0000-0000-000000000001'

beforeAll(async () => {
  process.env.DATABASE_URL = 'pglite:memory'
  await db.query("INSERT INTO tenants (id, name, slug) VALUES ($1, 'Escola', 'escola')", [T])
  const [u] = await db.query<{ id: string }>("INSERT INTO school_units (tenant_id, name, code) VALUES ($1, 'U1', 'U1') RETURNING id", [T])
  await db.query("INSERT INTO class_groups (tenant_id, school_unit_id, name, year) VALUES ($1, $2, '3ª Série', 2026)", [T, u.id])
  await db.query("INSERT INTO subjects (tenant_id, name, code) VALUES ($1, 'Biologia 1', 'BIO1'), ($1, 'Física', 'FIS')", [T])
  await db.query("INSERT INTO teachers (tenant_id, name) VALUES ($1, 'Raquel'), ($1, 'Jeann')", [T])
})
afterAll(closeDb)

const payload = robotPayloadSchema.parse({
  lido_em: '2026-11-20T02:00:00-03:00',
  leituras: [
    {
      ano: 2026,
      mes: 11,
      turma: '3ª SÉRIE - ENSINO MÉDIO',
      disciplina: 'BIOLOGIA 1',
      professor: 'RAQUEL PEREIRA',
      aulas: [
        { data: '2026-11-03', chamada: true, conteudo: 'Genética' },
        { data: '2026-11-10', chamada: true, conteudo: null },
      ],
      previstas: 9,
      realizadas: 8,
    },
    { ano: 2026, mes: 11, turma: '3ª SÉRIE - ENSINO MÉDIO', disciplina: 'OFICINA DE FÍSICA', aulas: [] },
  ],
})

describe('importação das leituras do robô', () => {
  it('grava as leituras, vincula sozinho o que bate e devolve o que falta', async () => {
    const r = await importRobotReadings(payload)
    expect(r.gravadas).toBe(2)
    expect(r.sem_vinculo).toEqual({ turma: [], disciplina: ['OFICINA DE FÍSICA'], professor: [] })

    const links = await db.query<{ kind: string; name: string; auto: boolean; linked: boolean }>(
      'SELECT kind, name, auto, local_id IS NOT NULL AS linked FROM em_links ORDER BY kind, name',
    )
    expect(links).toEqual([
      { kind: 'disciplina', name: 'BIOLOGIA 1', auto: true, linked: true },
      { kind: 'disciplina', name: 'OFICINA DE FÍSICA', auto: false, linked: false },
      { kind: 'professor', name: 'RAQUEL PEREIRA', auto: true, linked: true },
      { kind: 'turma', name: '3ª SÉRIE - ENSINO MÉDIO', auto: true, linked: true },
    ])

    const reading = await db.one<{ lessons: unknown[]; planned: number }>(
      "SELECT lessons, planned FROM diary_readings WHERE em_disciplina_key = 'BIOLOGIA 1'",
    )
    expect(reading).toEqual({
      lessons: [
        { date: '2026-11-03', attendance: true, content: 'Genética' },
        { date: '2026-11-10', attendance: true, content: null },
      ],
      planned: 9,
    })
  })

  it('reenvio substitui a leitura; leitura mais antiga não sobrescreve a nova; vínculo manual fica', async () => {
    await db.query("UPDATE em_links SET local_id = NULL, ignored = true WHERE name = 'OFICINA DE FÍSICA'")
    const newer = { ...payload, lido_em: '2026-11-21T02:00:00-03:00', leituras: [{ ...payload.leituras[0], aulas: [] }] }
    await importRobotReadings(newer)
    const older = { ...payload, lido_em: '2026-11-19T02:00:00-03:00' }
    const r = await importRobotReadings(older)
    expect(r.sem_vinculo.disciplina).toEqual([])

    const reading = await db.one<{ lessons: unknown[] }>(
      "SELECT lessons FROM diary_readings WHERE em_disciplina_key = 'BIOLOGIA 1'",
    )
    expect(reading!.lessons).toEqual([])
    expect(await db.one<{ n: number }>('SELECT count(*)::int AS n FROM diary_readings')).toEqual({ n: 2 })
  })
})
