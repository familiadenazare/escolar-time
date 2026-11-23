/**
 * Cópia única dos dados do Supabase (programa de horários) para este banco.
 * TEMPORÁRIO: sai do código depois da migração.
 *
 * Recebe { tabela: linhas[] } exportado do Supabase, grava tudo numa transação
 * só (sem triggers de auditoria/updated_at, sem checar FK durante a carga),
 * confere contagens e órfãos no fim e desfaz tudo se algo não bater. Recusa se
 * o banco já tiver dados.
 */
import { tx, type Queryable } from '@/lib/db'

/** Ordem de carga (pais antes dos filhos). */
export const IMPORT_TABLES = [
  'tenants',
  'profiles',
  'school_units',
  'subjects',
  'teachers',
  'class_groups',
  'class_subjects',
  'teaching_assignments',
  'time_grids',
  'time_slots',
  'teacher_constraints',
  'global_rules',
  'generated_schedules',
  'schedule_entries',
  'audit_log',
] as const

export type ImportPayload = Partial<Record<(typeof IMPORT_TABLES)[number], Record<string, unknown>[]>>

export type ImportResult = { tabelas: Record<string, { origem: number; destino: number }> }

const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`nome inválido: ${s}`)
  return `"${s}"`
}

export async function importSupabase(payload: ImportPayload): Promise<ImportResult> {
  const unknownTables = Object.keys(payload).filter((t) => !(IMPORT_TABLES as readonly string[]).includes(t))
  if (unknownTables.length) throw new Error(`tabelas desconhecidas: ${unknownTables.join(', ')}`)

  return tx(null, async (q: Queryable) => {
    await q.query("SET LOCAL session_replication_role = 'replica'")

    for (const t of IMPORT_TABLES) {
      const row = await q.one<{ n: number }>(`SELECT count(*)::int AS n FROM ${ident(t)}`)
      if (row!.n > 0) throw new Error(`o banco já tem dados (${t}) — cópia cancelada`)
    }

    for (const t of IMPORT_TABLES) {
      const rows = payload[t] ?? []
      if (rows.length === 0) continue
      const target = new Set(
        (
          await q.query<{ column_name: string }>(
            "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
            [t],
          )
        ).map((r) => r.column_name),
      )
      const extra = Object.keys(rows[0]).filter((c) => !target.has(c))
      if (extra.length) throw new Error(`${t}: colunas que não existem aqui: ${extra.join(', ')}`)
      const cols = Object.keys(rows[0]).map(ident).join(', ')
      await q.query(
        `INSERT INTO ${ident(t)} (${cols}) OVERRIDING SYSTEM VALUE
         SELECT ${cols} FROM json_populate_recordset(null::${ident(t)}, $1::json)`,
        [JSON.stringify(rows)],
      )
    }

    await q.query(
      `SELECT setval(pg_get_serial_sequence('audit_log', 'id'),
                     GREATEST((SELECT max(id) FROM audit_log), 1),
                     (SELECT max(id) FROM audit_log) IS NOT NULL)`,
    )

    const tabelas: ImportResult['tabelas'] = {}
    for (const t of IMPORT_TABLES) {
      const row = await q.one<{ n: number }>(`SELECT count(*)::int AS n FROM ${ident(t)}`)
      tabelas[t] = { origem: payload[t]?.length ?? 0, destino: row!.n }
      if (tabelas[t].origem !== tabelas[t].destino) {
        throw new Error(`contagem errada em ${t}: ${tabelas[t].destino} (esperado ${tabelas[t].origem})`)
      }
    }

    // A carga foi sem checar FK: confere órfãos antes de confirmar.
    const fks = await q.query<{ tbl: string; def: string }>(
      `SELECT conrelid::regclass::text AS tbl, pg_get_constraintdef(oid) AS def
       FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace`,
    )
    for (const fk of fks) {
      const m = fk.def.match(/FOREIGN KEY \(([^)]+)\) REFERENCES ([\w.]+)\(([^)]+)\)/)
      if (!m) continue
      const local = m[1].split(',').map((x) => x.trim())
      const remote = m[3].split(',').map((x) => x.trim())
      const on = local.map((x, i) => `r.${remote[i]} = t.${x}`).join(' AND ')
      const notNull = local.map((x) => `t.${x} IS NOT NULL`).join(' AND ')
      const row = await q.one<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${fk.tbl} t WHERE ${notNull} AND NOT EXISTS (SELECT 1 FROM ${m[2]} r WHERE ${on})`,
      )
      if (row!.n > 0) throw new Error(`${row!.n} registro(s) sem referência em ${fk.tbl} (${fk.def})`)
    }

    return { tabelas }
  })
}
