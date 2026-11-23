import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/session'
import { Sidebar } from '@/components/layout/sidebar'
import { CanEditProvider } from '@/components/auth/can-edit'
import { canEdit } from '@/lib/auth/roles'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Sem perfil ativo (cookie inválido ou perfil desativado), sem acesso.
  const profile = await getSessionProfile()
  if (!profile) redirect('/auth/signout?error=inactive')

  const editor = canEdit(profile.role)

  return (
    <CanEditProvider canEdit={editor}>
      <div className="flex min-h-screen flex-col md:flex-row">
        <Sidebar
          userName={profile.name || profile.email}
          userEmail={profile.email}
          role={profile.role}
          isAdmin={profile.role === 'ADMIN'}
          canEdit={editor}
        />
        <main className="min-w-0 flex-1 overflow-y-auto bg-paper">
          <div className="p-4 md:p-8">
            {children}
          </div>
        </main>
      </div>
    </CanEditProvider>
  )
}
