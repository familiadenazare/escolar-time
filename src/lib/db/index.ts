/**
 * Acesso ao banco (Postgres próprio no Coolify). Só o servidor fala com o banco:
 * páginas, server actions e rotas de API importam daqui; componentes do navegador
 * nunca.
 *
 * DATABASE_URL:
 *   postgres://usuario:senha@host:5432/escolartime   → Postgres de verdade (pg)
 *   pglite:./.data/pglite                            → Postgres embutido (dev)
 *   pglite:memory                                    → em memória (testes)
 *
 * As migrations de db/migrations/*.sql são aplicadas na primeira conexão, em
 * ordem, uma vez cada (tabela schema_migrations).
 *
 * Gravações que devem aparecer no Histórico com autor passam por `tx(actorId, …)`
 * ou `run(actorId, …)`: a transação define app.actor_id, que o trigger
 * audit_row_change lê.
 */
import fs from 'node:fs'
import path from 'node:path'

export type Params = readonly unknown[]

export interface Queryable {
  /** Linhas do resultado. */
  query<T = Record<string, unknown>>(text: string, params?: Params): Promise<T[]>
  /** Primeira linha ou null. */
  one<T = Record<string, unknown>>(text: string, params?: Params): Promise<T | null>
}

interface Driver {
  query(text: string, params?: Params): Promise<{ rows: unknown[] }>
  exec(text: string): Promise<void>
  transaction<T>(fn: (q: Pick<Driver, 'query' | 'exec'>) => Promise<T>): Promise<T>
  close(): Promise<void>
}

// timestamptz como texto ISO e bigint como número — o formato que o resto do
// app já esperava (vinha assim do Supabase).
const TIMESTAMPTZ = 1184
const TIMESTAMP = 1114
const INT8 = 20
const toIso = (v: string) => new Date(v).toISOString()

async function pgDriver(url: string): Promise<Driver> {
  const pg = await import('pg')
  const { Pool, types } = pg.default ?? pg
  types.setTypeParser(TIMESTAMPTZ, toIso)
  types.setTypeParser(TIMESTAMP, (v: string) => v.replace(' ', 'T'))
  types.setTypeParser(INT8, (v: string) => Number(v))
  const pool = new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX ?? 10) })
  return {
    query: (text, params) => pool.query(text, params as unknown[]),
    exec: async (text) => {
      await pool.query(text)
    },
    async transaction(fn) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await fn({
          query: (t, p) => client.query(t, p as unknown[]),
          exec: async (t) => void (await client.query(t)),
        })
        await client.query('COMMIT')
        return result
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {})
        throw e
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

async function pgliteDriver(location: string): Promise<Driver> {
  const { PGlite } = await import('@electric-sql/pglite')
  const parsers = {
    [TIMESTAMPTZ]: toIso,
    [TIMESTAMP]: (v: string) => v.replace(' ', 'T'),
    [INT8]: (v: string) => Number(v),
  }
  let dataDir: string | undefined
  if (location !== 'memory') {
    dataDir = path.resolve(location)
    fs.mkdirSync(dataDir, { recursive: true })
  }
  const db = new PGlite(dataDir, { parsers })
  // PGlite atende uma consulta por vez; a fila evita misturar uma transação
  // com consultas de outra requisição.
  let chain: Promise<unknown> = Promise.resolve()
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn)
    chain = next.catch(() => {})
    return next
  }
  return {
    query: (text, params) => serial(() => db.query(text, params as unknown[], { parsers })),
    exec: (text) => serial(async () => void (await db.exec(text))),
    transaction: (fn) =>
      serial(() =>
        db.transaction((tx) =>
          fn({ query: (t, p) => tx.query(t, p as unknown[], { parsers }), exec: async (t) => void (await tx.exec(t)) }),
        ),
      ),
    close: () => db.close(),
  }
}

function migrationsDir(): string {
  return process.env.DB_MIGRATIONS_DIR ?? path.join(process.cwd(), 'db', 'migrations')
}

async function migrate(driver: Driver): Promise<void> {
  const files = fs
    .readdirSync(migrationsDir())
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort()
  await driver.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await driver.transaction(async (q) => {
    // Duas instâncias subindo juntas não aplicam a mesma migration duas vezes.
    await q.query('SELECT pg_advisory_xact_lock(727274)')
    const { rows } = await q.query('SELECT name FROM schema_migrations')
    const done = new Set((rows as { name: string }[]).map((r) => r.name))
    for (const file of files) {
      if (done.has(file)) continue
      const text = fs.readFileSync(path.join(migrationsDir(), file), 'utf8')
      await q.exec(text)
      await q.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
    }
  })
}

type Global = typeof globalThis & { __escolarDb?: Promise<Driver> }

function connect(): Promise<Driver> {
  const g = globalThis as Global
  if (!g.__escolarDb) {
    const url = process.env.DATABASE_URL?.trim()
    if (!url) throw new Error('DATABASE_URL não definida.')
    g.__escolarDb = (async () => {
      const driver = url.startsWith('pglite:') ? await pgliteDriver(url.slice('pglite:'.length)) : await pgDriver(url)
      await migrate(driver)
      return driver
    })()
    g.__escolarDb.catch(() => {
      g.__escolarDb = undefined
    })
  }
  return g.__escolarDb
}

function wrap(run: (text: string, params?: Params) => Promise<{ rows: unknown[] }>): Queryable {
  return {
    async query<T>(text: string, params?: Params) {
      return (await run(text, params)).rows as T[]
    },
    async one<T>(text: string, params?: Params) {
      return ((await run(text, params)).rows[0] as T | undefined) ?? null
    },
  }
}

/** Consultas soltas (leituras, ou gravações que não precisam de autor no Histórico). */
export const db: Queryable = wrap(async (text, params) => (await connect()).query(text, params))

/**
 * Transação com autor: tudo dentro de `fn` é gravado de uma vez (ou nada) e o
 * Histórico registra `actorId` (perfil) como quem fez. `actorId` nulo = "Sistema".
 */
export async function tx<T>(actorId: string | null, fn: (q: Queryable) => Promise<T>): Promise<T> {
  const driver = await connect()
  return driver.transaction(async (raw) => {
    if (actorId) await raw.query("SELECT set_config('app.actor_id', $1, true)", [actorId])
    return fn(wrap(raw.query))
  })
}

/** Uma gravação só, com autor. */
export function run<T = Record<string, unknown>>(actorId: string | null, text: string, params?: Params): Promise<T[]> {
  return tx(actorId, (q) => q.query<T>(text, params))
}

/** Fecha a conexão (testes e scripts). */
export async function closeDb(): Promise<void> {
  const g = globalThis as Global
  const pending = g.__escolarDb
  g.__escolarDb = undefined
  if (pending) await (await pending).close()
}

/**
 * INSERT de várias linhas: `INSERT INTO t (a, b) VALUES ${values}`, com
 * placeholders numerados a partir de `start`.
 */
export function bulkValues(rows: readonly (readonly unknown[])[], start = 1): { values: string; params: unknown[] } {
  const params: unknown[] = []
  const groups = rows.map((row) => {
    const marks = row.map((v) => {
      params.push(v)
      return `$${start + params.length - 1}`
    })
    return `(${marks.join(', ')})`
  })
  return { values: groups.join(', '), params }
}

/** Erro de violação de unicidade do Postgres. */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505'
}

/** Erro de chave estrangeira (registro em uso). */
export function isForeignKeyViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '23503'
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
