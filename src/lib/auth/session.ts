import { cache } from 'react'
import { cookies } from 'next/headers'

import { db } from '@/lib/db'
import { canEdit } from './roles'
import { SESSION_COOKIE, verifySessionToken } from './session-token'

export type { RoleKey as Role } from './roles'
import type { RoleKey as Role } from './roles'

export type SessionProfile = {
  id: string
  tenant_id: string
  name: string
  email: string
  role: Role
}

/**
 * Perfil ativo do usuário logado, ou null. Desativar o perfil corta o acesso na
 * hora, mesmo com o cookie ainda válido. Memorizado por requisição (layout,
 * página e componentes do servidor consultam o banco uma vez só).
 */
export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const store = await cookies()
  const profileId = await verifySessionToken(store.get(SESSION_COOKIE)?.value)
  if (!profileId) return null

  return db.one<SessionProfile>(
    'SELECT id, tenant_id, name, email, role FROM profiles WHERE id = $1 AND active',
    [profileId],
  )
})

/** Perfil do usuário logado se for ADMIN ativo; senão null. */
export async function getAdminProfile(): Promise<SessionProfile | null> {
  const profile = await getSessionProfile()
  return profile?.role === 'ADMIN' ? profile : null
}

/** Perfil do usuário logado se ele puder alterar dados (ADMIN ou COORDINATOR); senão null. */
export async function getEditorProfile(): Promise<SessionProfile | null> {
  const profile = await getSessionProfile()
  return profile && canEdit(profile.role) ? profile : null
}

export const READ_ONLY_ERROR = 'Seu perfil é somente de consulta. Peça acesso ao administrador.'
export const NOT_LOGGED_IN_ERROR = 'Sua sessão expirou. Entre novamente.'

/**
 * Guarda das server actions que gravam dados: devolve o perfil de quem pode
 * editar, ou o erro a retornar. O banco não tem RLS — esta é a proteção.
 */
export async function requireEditorAction(): Promise<
  { ok: true; profile: SessionProfile } | { ok: false; result: { success: false; error: string } }
> {
  const profile = await getSessionProfile()
  if (!profile) return { ok: false, result: { success: false, error: NOT_LOGGED_IN_ERROR } }
  if (!canEdit(profile.role)) return { ok: false, result: { success: false, error: READ_ONLY_ERROR } }
  return { ok: true, profile }
}

/** Página do painel: perfil logado (o layout já manda para o login quem não está). */
export async function requireProfile(): Promise<SessionProfile> {
  const profile = await getSessionProfile()
  if (!profile) throw new Error(NOT_LOGGED_IN_ERROR)
  return profile
}
