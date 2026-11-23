import { z } from 'zod'

import { bulkValues, db, tx, type Queryable } from '@/lib/db'
import { autoMatch, emKey, type EmKind, type LocalCandidate } from './escolar'

/**
 * Formato que o robô rpa-pedagogico manda em POST /api/robo/diarios
 * (português, como o dos boletins para a Preceptoria).
 */
export const robotPayloadSchema = z.object({
  lido_em: z.iso.datetime({ offset: true }),
  leituras: z
    .array(
      z.object({
        ano: z.number().int().min(2000).max(2100),
        mes: z.number().int().min(1).max(12),
        turma: z.string().trim().min(1).max(200),
        disciplina: z.string().trim().min(1).max(200),
        professor: z.string().trim().max(200).nullish(),
        aulas: z
          .array(
            z.object({
              data: z.iso.date(),
              chamada: z.boolean(),
              conteudo: z.string().max(4000).nullish(),
            }),
          )
          .max(400),
        previstas: z.number().int().min(0).max(10000).nullish(),
        realizadas: z.number().int().min(0).max(10000).nullish(),
      }),
    )
    .max(5000),
})

export type RobotPayload = z.infer<typeof robotPayloadSchema>

export type ImportResult = {
  gravadas: number
  /** Nomes do Escolar ainda sem vínculo (para o robô mostrar). */
  sem_vinculo: Record<EmKind, string[]>
}

type LinkWanted = { kind: EmKind; key: string; name: string; year?: number }

async function candidates(q: Queryable, tenantId: string, kind: EmKind, year?: number): Promise<LocalCandidate[]> {
  if (kind === 'turma') {
    return q.query<LocalCandidate>(
      'SELECT id, name FROM class_groups WHERE tenant_id = $1 AND year = $2 AND active',
      [tenantId, year],
    )
  }
  const table = kind === 'disciplina' ? 'subjects' : 'teachers'
  return q.query<LocalCandidate>(`SELECT id, name FROM ${table} WHERE tenant_id = $1 AND active`, [tenantId])
}

/**
 * Grava as leituras (uma por turma × disciplina × mês; a nova substitui a
 * anterior) e cria os vínculos que faltam, ligando sozinho quando o nome bate
 * com um único cadastro. Vínculos já existentes (feitos à mão) não são tocados.
 */
export async function importRobotReadings(payload: RobotPayload): Promise<ImportResult> {
  const tenant = await db.one<{ id: string }>('SELECT id FROM tenants WHERE active ORDER BY created_at LIMIT 1')
  if (!tenant) throw new Error('Nenhuma escola cadastrada.')
  const tenantId = tenant.id

  const wanted = new Map<string, LinkWanted>()
  const want = (w: LinkWanted) => wanted.set(`${w.kind}|${w.key}`, w)
  for (const l of payload.leituras) {
    want({ kind: 'turma', key: emKey('turma', l.turma, l.ano), name: l.turma, year: l.ano })
    want({ kind: 'disciplina', key: emKey('disciplina', l.disciplina), name: l.disciplina })
    if (l.professor) want({ kind: 'professor', key: emKey('professor', l.professor), name: l.professor })
  }

  return tx(null, async (q) => {
    // 1. Vínculos novos (com tentativa automática).
    const existing = new Set(
      (
        await q.query<{ kind: string; em_key: string }>('SELECT kind, em_key FROM em_links WHERE tenant_id = $1', [
          tenantId,
        ])
      ).map((r) => `${r.kind}|${r.em_key}`),
    )
    const cache = new Map<string, LocalCandidate[]>()
    for (const [id, w] of wanted) {
      if (existing.has(id)) continue
      const cacheKey = `${w.kind}|${w.year ?? ''}`
      if (!cache.has(cacheKey)) cache.set(cacheKey, await candidates(q, tenantId, w.kind, w.year))
      const localId = autoMatch(w.kind, w.name, cache.get(cacheKey)!)
      await q.query(
        `INSERT INTO em_links (tenant_id, kind, em_key, name, local_id, auto)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT ON CONSTRAINT em_links_unique DO NOTHING`,
        [tenantId, w.kind, w.key, w.name, localId, localId !== null],
      )
    }

    // 2. Leituras (em lotes, para não estourar o limite de parâmetros).
    const rows = payload.leituras.map((l) => [
      tenantId,
      emKey('turma', l.turma, l.ano),
      emKey('disciplina', l.disciplina),
      l.professor ? emKey('professor', l.professor) : null,
      l.ano,
      l.mes,
      JSON.stringify(l.aulas.map((a) => ({ date: a.data, attendance: a.chamada, content: a.conteudo ?? null }))),
      l.previstas ?? null,
      l.realizadas ?? null,
      payload.lido_em,
    ])
    for (let i = 0; i < rows.length; i += 500) {
      const { values, params } = bulkValues(rows.slice(i, i + 500))
      await q.query(
        `INSERT INTO diary_readings
           (tenant_id, em_turma_key, em_disciplina_key, em_professor_key, year, month, lessons, planned, given, read_at)
         SELECT t.tenant_id::uuid, t.turma, t.disc, t.prof, t.ano::int, t.mes::int, t.lessons::jsonb,
                t.planned::int, t.given::int, t.read_at::timestamptz
           FROM (VALUES ${values}) AS t(tenant_id, turma, disc, prof, ano, mes, lessons, planned, given, read_at)
         ON CONFLICT ON CONSTRAINT diary_readings_unique DO UPDATE
           SET em_professor_key = EXCLUDED.em_professor_key, lessons = EXCLUDED.lessons,
               planned = EXCLUDED.planned, given = EXCLUDED.given, read_at = EXCLUDED.read_at
         WHERE diary_readings.read_at <= EXCLUDED.read_at`,
        params,
      )
    }

    // 3. O que ainda falta vincular (entre os nomes deste envio).
    const pending = await q.query<{ kind: EmKind; name: string; em_key: string }>(
      'SELECT kind, name, em_key FROM em_links WHERE tenant_id = $1 AND local_id IS NULL AND NOT ignored',
      [tenantId],
    )
    const sem_vinculo: Record<EmKind, string[]> = { turma: [], disciplina: [], professor: [] }
    for (const p of pending) if (wanted.has(`${p.kind}|${p.em_key}`)) sem_vinculo[p.kind].push(p.name)

    return { gravadas: payload.leituras.length, sem_vinculo }
  })
}
