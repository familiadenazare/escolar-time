import { db, tx } from '@/lib/db'
import { isAllowedEmail } from './allowed-domain'
import { DEFAULT_ROLE } from './roles'

export type LoginOutcome =
  | { ok: true; profileId: string }
  | { ok: false; reason: 'domain' | 'inactive' | 'no_profile' }

/**
 * Quem pode entrar: conta do domínio da escola. Perfil existente (pelo e-mail)
 * entra se estiver ativo; quem entra pela primeira vez ganha perfil de
 * Visualizador (só consulta) e o administrador promove quem precisar editar.
 */
export async function resolveLogin(emailRaw: string, nameRaw: string | null): Promise<LoginOutcome> {
  const email = emailRaw.trim().toLowerCase()
  if (!isAllowedEmail(email)) return { ok: false, reason: 'domain' }

  const existing = await db.one<{ id: string; active: boolean }>(
    'SELECT id, active FROM profiles WHERE lower(email) = $1',
    [email],
  )
  if (existing && !existing.active) return { ok: false, reason: 'inactive' }

  let profileId = existing?.id
  if (!profileId) {
    const name = nameRaw?.trim() || email.split('@')[0]
    const id = crypto.randomUUID()
    // A escola é um tenant só: quem chega entra nele.
    const tenant = await db.one<{ id: string }>('SELECT id FROM tenants WHERE active ORDER BY created_at LIMIT 1')
    if (!tenant) return { ok: false, reason: 'no_profile' }
    try {
      // A própria pessoa aparece como autora do cadastro no Histórico.
      await tx(id, (q) =>
        q.query(
          `INSERT INTO profiles (id, tenant_id, name, email, role, active)
           VALUES ($1, $2, $3, $4, $5, true)
           ON CONFLICT DO NOTHING`,
          [id, tenant.id, name, email, DEFAULT_ROLE],
        ),
      )
    } catch {
      return { ok: false, reason: 'no_profile' }
    }
    const created = await db.one<{ id: string; active: boolean }>(
      'SELECT id, active FROM profiles WHERE lower(email) = $1',
      [email],
    )
    if (!created) return { ok: false, reason: 'no_profile' }
    if (!created.active) return { ok: false, reason: 'inactive' }
    profileId = created.id
  }

  await db.query('UPDATE profiles SET last_login_at = now() WHERE id = $1', [profileId])
  return { ok: true, profileId }
}
