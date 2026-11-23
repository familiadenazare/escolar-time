'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ALLOWED_EMAIL_DOMAIN } from '@/lib/auth/allowed-domain'

const CALLBACK_ERRORS: Record<string, string> = {
  domain: `Use uma conta Google @${ALLOWED_EMAIL_DOMAIN}.`,
  no_profile:
    'Não foi possível criar seu acesso. Tente novamente ou fale com o administrador.',
  oauth: 'Não foi possível entrar com o Google. Tente novamente.',
  inactive: 'Seu acesso está desativado. Fale com o administrador.',
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.87c2.27-2.09 3.58-5.17 3.58-8.81z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.87-3c-1.07.72-2.45 1.15-4.08 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.09A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.27a12 12 0 0 0 0 10.74l4-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.63l4 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
  )
}

/** Login só com a conta Google da escola (o app não guarda senhas). */
export function LoginForm({ callbackError }: { callbackError?: string }) {
  const [loading, setLoading] = useState(false)
  const error = callbackError ? (CALLBACK_ERRORS[callbackError] ?? CALLBACK_ERRORS.oauth) : null

  return (
    <Card className="w-full max-w-md mx-4 shadow-xl border-0">
      <CardHeader className="pb-2 text-center">
        <h1 className="text-3xl font-bold text-navy tracking-tight">EscolarTime</h1>
        <p className="text-sm text-slate mt-1">
          Entre com a sua conta Google @{ALLOWED_EMAIL_DOMAIN}
        </p>
      </CardHeader>

      <CardContent className="pt-4 space-y-5">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}
        <Button
          nativeButton={false}
          render={<a href="/auth/google" />}
          onClick={() => setLoading(true)}
          className="w-full h-11 bg-navy hover:bg-navy-light text-white font-semibold cursor-pointer"
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GoogleIcon />}
          Entrar com Google
        </Button>
      </CardContent>
    </Card>
  )
}
