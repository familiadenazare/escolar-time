'use client'

import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { DIARY_STATUS_INFO, monthName } from '@/lib/diaries/status'
import { pendingMessage, type TeacherPending } from '@/lib/diaries/rows'

/** Pendências do mês por professor, com a mensagem de cobrança pronta para copiar. */
export function PendingView({
  pending,
  month,
  year,
  unchecked,
}: {
  pending: TeacherPending[]
  month: number
  year: number
  unchecked: number
}) {
  const [copied, setCopied] = useState<string | null>(null)

  async function copy(p: TeacherPending) {
    try {
      await navigator.clipboard.writeText(pendingMessage(p, month, year))
      setCopied(p.teacherId)
      toast.success(`Mensagem para ${p.teacherName} copiada`)
      setTimeout(() => setCopied((c) => (c === p.teacherId ? null : c)), 2000)
    } catch {
      toast.error('Não foi possível copiar. Selecione o texto manualmente.')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate">
        {pending.length === 0
          ? `Nenhuma pendência marcada em ${monthName(month).toLowerCase()}/${year}.`
          : `${pending.length} ${pending.length === 1 ? 'professor' : 'professores'} com pendência em ${monthName(month).toLowerCase()}/${year}.`}
        {unchecked > 0 && (
          <span className="ml-1 text-ocre-dark">
            {unchecked} {unchecked === 1 ? 'diário ainda não foi verificado' : 'diários ainda não foram verificados'} nesse mês.
          </span>
        )}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {pending.map((p) => (
          <section key={p.teacherId} className="rounded-lg border border-border bg-white">
            <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
              <h3 className="font-semibold text-navy">
                {p.teacherName}
                <span className="ml-2 text-xs font-normal text-slate">
                  {p.items.length} {p.items.length === 1 ? 'diário' : 'diários'}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => copy(p)}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-navy hover:bg-surface cursor-pointer"
              >
                {copied === p.teacherId ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                Copiar mensagem
              </button>
            </header>
            <ul className="divide-y divide-border">
              {p.items.map((i) => {
                const info = DIARY_STATUS_INFO[i.status]
                return (
                  <li key={i.row.key} className="flex items-start gap-3 px-4 py-2 text-sm">
                    <span className="w-24 shrink-0 font-medium text-navy">{i.className}</span>
                    <span className="flex-1 text-navy">
                      {i.row.subjectLabel}
                      {i.notes && <span className="block text-xs text-slate">{i.notes}</span>}
                    </span>
                    <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-xs font-medium', info.cell)}>
                      {info.short}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
