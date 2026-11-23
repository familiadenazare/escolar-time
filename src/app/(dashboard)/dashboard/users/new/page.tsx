import { redirect } from 'next/navigation'
import { getAdminProfile } from '@/lib/auth/session'
import { UserForm } from '@/components/users/user-form'

export default async function NewUserPage() {
  if (!(await getAdminProfile())) redirect('/dashboard')

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Novo Usuário</h1>
        <p className="text-slate text-sm mt-1">
          A pessoa entra com a conta Google da escola (o mesmo e-mail cadastrado aqui).
        </p>
      </div>
      <UserForm />
    </div>
  )
}
