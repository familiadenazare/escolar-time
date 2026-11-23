'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'

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
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
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
    <main className="relative m-auto w-full max-w-[420px] px-[18px] py-9">
      <div className="mb-6 flex flex-col items-center text-center text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/crest.png"
          alt="Brasão do Colégio Arquidiocesano Família de Nazaré"
          width={73}
          height={92}
          className="mb-3 h-[92px] w-auto drop-shadow-[0_4px_10px_rgba(0,0,0,0.25)]"
        />
        <p className="text-[11.5px] font-bold uppercase tracking-[0.16em] text-ocre">
          Colégio Arquidiocesano Família de Nazaré
        </p>
        <h1 className="mt-1 text-4xl text-white">Pedagógico</h1>
        <p className="flex items-center gap-3 font-serif text-xl italic text-ocre-light before:h-px before:w-6 before:bg-ocre after:h-px after:w-6 after:bg-ocre">
          Horários e Diários
        </p>
      </div>

      <div className="rounded-2xl border-t-4 border-ocre bg-white px-5 py-6 shadow-[0_18px_40px_rgba(0,0,0,0.25)]">
        <h2 className="mb-1 font-serif text-2xl font-semibold text-navy">Entrar</h2>
        <p className="mb-4 text-sm text-slate">
          Use a sua conta Google @{ALLOWED_EMAIL_DOMAIN}.
        </p>

        {error && (
          <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}

        <a
          href="/auth/google"
          role="button"
          onClick={() => setLoading(true)}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-[#DADCE0] bg-white text-[15px] font-medium text-[#3C4043] transition-colors hover:bg-[#F8FAFF] focus-visible:outline-3 focus-visible:outline-offset-2"
        >
          {loading ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <GoogleIcon />}
          Fazer login com o Google
        </a>

        <p className="mt-4 text-center text-[13px] text-slate">
          No primeiro acesso você entra como visualizador. Para editar, peça ao administrador.
        </p>
      </div>
    </main>
  )
}
