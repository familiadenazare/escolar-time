/**
 * Banco local de desenvolvimento (PGlite em .data/pglite), sem instalar Postgres.
 * Aplica db/migrations e, se o banco estiver vazio, os dados fictícios de
 * db/dev-seed.sql. Rodar com o servidor PARADO (o PGlite abre a pasta em um
 * processo só):
 *
 *   node scripts/dev-db.mjs            # cria/atualiza
 *   node scripts/dev-db.mjs --reset    # apaga e recria do zero
 *
 * Depois: DATABASE_URL=pglite:./.data/pglite SESSION_SECRET=<32+ caracteres> DEV_LOGIN=1 npm run dev
 * e entre em /auth/dev?email=admin.dev@familiadenazare.com.br
 */
import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const DIR = path.resolve('.data/pglite')
const MIGRATIONS = path.resolve('db/migrations')

if (process.argv.includes('--reset')) fs.rmSync(DIR, { recursive: true, force: true })
fs.mkdirSync(DIR, { recursive: true })

const db = new PGlite(DIR)
await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
const done = new Set((await db.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name))
for (const file of fs.readdirSync(MIGRATIONS).filter((f) => /^\d+_.+\.sql$/.test(f)).sort()) {
  if (done.has(file)) continue
  await db.transaction(async (tx) => {
    await tx.exec(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'))
    await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
  })
  console.log('migration aplicada:', file)
}

const { rows } = await db.query('SELECT count(*)::int AS n FROM tenants')
if (rows[0].n === 0) {
  await db.exec(fs.readFileSync(path.resolve('db/dev-seed.sql'), 'utf8'))
  console.log('dados fictícios carregados')
} else {
  console.log('banco já tem dados; seed ignorado')
}
await db.close()
