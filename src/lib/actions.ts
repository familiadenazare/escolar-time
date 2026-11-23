import { errorMessage, isForeignKeyViolation, isUniqueViolation } from '@/lib/db'
import { requireEditorAction, type SessionProfile } from '@/lib/auth/session'

export type ActionResult = { success: boolean; error?: string }

/** Erro do banco em português para a tela. */
export function friendlyDbError(e: unknown, messages?: { unique?: string; foreignKey?: string }): string {
  if (isUniqueViolation(e)) return messages?.unique ?? 'Já existe um registro com esses dados.'
  if (isForeignKeyViolation(e)) {
    return messages?.foreignKey ?? 'Este registro está em uso em outra parte do sistema e não pode ser alterado assim.'
  }
  return errorMessage(e)
}

/**
 * Server action que grava: só ADMIN/COORDINATOR. `fn` recebe o perfil (use
 * profile.id como autor em tx/run e profile.tenant_id nas consultas). Erros do
 * banco viram { success: false, error }.
 */
export async function editorAction(
  fn: (profile: SessionProfile) => Promise<ActionResult | void>,
  messages?: { unique?: string; foreignKey?: string },
): Promise<ActionResult> {
  const guard = await requireEditorAction()
  if (!guard.ok) return guard.result
  try {
    return (await fn(guard.profile)) ?? { success: true }
  } catch (e) {
    return { success: false, error: friendlyDbError(e, messages) }
  }
}
