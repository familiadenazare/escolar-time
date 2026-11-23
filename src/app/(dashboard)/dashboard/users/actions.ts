'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { db, run } from '@/lib/db'
import { friendlyDbError, type ActionResult } from '@/lib/actions'
import { getAdminProfile, type SessionProfile } from '@/lib/auth/session'
import { isAllowedEmail, ALLOWED_EMAIL_DOMAIN } from '@/lib/auth/allowed-domain'

const roleSchema = z.enum(['ADMIN', 'COORDINATOR', 'VIEWER'])

const createSchema = z.object({
  name: z.string().trim().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('E-mail inválido')
    .refine(isAllowedEmail, `Use um e-mail @${ALLOWED_EMAIL_DOMAIN}`),
  role: roleSchema,
})

const updateSchema = z.object({
  name: z.string().trim().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  role: roleSchema,
})

const NOT_ADMIN: ActionResult = {
  success: false,
  error: 'Apenas administradores podem gerenciar usuários.',
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Dados inválidos.'
}

/** Há outro administrador ativo além de `exceptId`? Evita trancar o sistema. */
async function hasOtherActiveAdmin(admin: SessionProfile, exceptId: string) {
  const row = await db.one(
    "SELECT 1 FROM profiles WHERE tenant_id = $1 AND role = 'ADMIN' AND active AND id <> $2 LIMIT 1",
    [admin.tenant_id, exceptId],
  )
  return row !== null
}

type Target = { id: string; role: string; active: boolean }

function findTarget(admin: SessionProfile, id: string) {
  return db.one<Target>('SELECT id, role, active FROM profiles WHERE id = $1 AND tenant_id = $2', [
    id,
    admin.tenant_id,
  ])
}

/**
 * Cadastra o perfil. Não há senha: a pessoa entra com a conta Google da escola
 * e o login a encontra pelo e-mail.
 */
export async function createUser(input: unknown): Promise<ActionResult> {
  const admin = await getAdminProfile()
  if (!admin) return NOT_ADMIN

  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error) }
  const { name, email, role } = parsed.data

  try {
    await run(
      admin.id,
      'INSERT INTO profiles (tenant_id, name, email, role, active) VALUES ($1, $2, $3, $4, true)',
      [admin.tenant_id, name, email, role],
    )
  } catch (e) {
    return { success: false, error: friendlyDbError(e, { unique: 'Já existe um usuário com este e-mail.' }) }
  }

  revalidatePath('/dashboard/users')
  return { success: true }
}

export async function updateUser(id: string, input: unknown): Promise<ActionResult> {
  const admin = await getAdminProfile()
  if (!admin) return NOT_ADMIN

  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error) }
  const { name, role } = parsed.data

  const target = await findTarget(admin, id)
  if (!target) return { success: false, error: 'Usuário não encontrado.' }

  if (target.role === 'ADMIN' && role !== 'ADMIN') {
    if (id === admin.id) {
      return { success: false, error: 'Você não pode remover o seu próprio papel de administrador.' }
    }
    if (target.active && !(await hasOtherActiveAdmin(admin, id))) {
      return { success: false, error: 'O sistema precisa de pelo menos um administrador ativo.' }
    }
  }

  try {
    await run(admin.id, 'UPDATE profiles SET name = $1, role = $2 WHERE id = $3 AND tenant_id = $4', [
      name,
      role,
      id,
      admin.tenant_id,
    ])
  } catch (e) {
    return { success: false, error: friendlyDbError(e) }
  }

  revalidatePath('/dashboard/users')
  revalidatePath('/dashboard', 'layout')
  return { success: true }
}

export async function toggleUserActive(id: string): Promise<ActionResult> {
  const admin = await getAdminProfile()
  if (!admin) return NOT_ADMIN

  if (id === admin.id) {
    return { success: false, error: 'Você não pode desativar o seu próprio acesso.' }
  }

  const target = await findTarget(admin, id)
  if (!target) return { success: false, error: 'Usuário não encontrado.' }

  if (target.active && target.role === 'ADMIN' && !(await hasOtherActiveAdmin(admin, id))) {
    return { success: false, error: 'O sistema precisa de pelo menos um administrador ativo.' }
  }

  try {
    await run(admin.id, 'UPDATE profiles SET active = NOT active WHERE id = $1 AND tenant_id = $2', [
      id,
      admin.tenant_id,
    ])
  } catch (e) {
    return { success: false, error: friendlyDbError(e) }
  }

  revalidatePath('/dashboard/users')
  return { success: true }
}
