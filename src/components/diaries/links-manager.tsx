'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { useCanEdit } from '@/components/auth/can-edit'
import { cn } from '@/lib/utils'
import { setEmLink } from '@/app/(dashboard)/dashboard/diaries/vinculos/actions'

type Kind = 'turma' | 'disciplina' | 'professor'

export type EmLinkRow = {
  id: string
  kind: Kind
  emKey: string
  name: string
  localId: string | null
  ignored: boolean
  auto: boolean
  readings: number
}

type Option = { id: string; name: string }

const KIND_LABEL: Record<Kind, { tab: string; local: string }> = {
  turma: { tab: 'Turmas', local: 'Turma daqui' },
  disciplina: { tab: 'Disciplinas', local: 'Disciplina daqui' },
  professor: { tab: 'Professores', local: 'Professor daqui' },
}

const IGNORE = '__ignorar__'

/**
 * Nomes do Escolar Manager (vindos das leituras do robô) × cadastros daqui.
 * Feito uma vez: o vínculo vale para as leituras de antes e de depois.
 */
export function LinksManager({ links: initial, options }: { links: EmLinkRow[]; options: Record<Kind, Option[]> }) {
  const canEdit = useCanEdit()
  const [links, setLinks] = useState(initial)
  const [kind, setKind] = useState<Kind>(() => initial.find((l) => !l.localId && !l.ignored)?.kind ?? 'turma')
  const [, startTransition] = useTransition()

  const pendingByKind = useMemo(() => {
    const out: Record<Kind, number> = { turma: 0, disciplina: 0, professor: 0 }
    for (const l of links) if (!l.localId && !l.ignored) out[l.kind]++
    return out
  }, [links])

  const visible = links.filter((l) => l.kind === kind)
  const nameById = useMemo(() => new Map(options[kind].map((o) => [o.id, o.name])), [options, kind])

  function change(link: EmLinkRow, value: string) {
    const ignored = value === IGNORE
    const localId = ignored || value === '' ? null : value
    const before = links
    setLinks((list) => list.map((l) => (l.id === link.id ? { ...l, localId, ignored, auto: false } : l)))
    startTransition(async () => {
      const res = await setEmLink({ id: link.id, localId, ignored })
      if (!res.success) {
        toast.error(res.error ?? 'Não foi possível salvar.')
        setLinks(before)
      }
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/diaries" className="mb-2 inline-flex items-center gap-1 text-sm text-slate hover:text-navy">
          <ArrowLeft className="h-4 w-4" /> Verificação de diários
        </Link>
        <p className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-ocre-dark">Diários</p>
        <h1 className="text-3xl text-navy">Vínculos com o Escolar</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate">
          O robô lê os diários no Escolar Manager com os nomes de lá. Aqui cada nome é ligado, uma vez, à turma,
          disciplina ou professor daqui. Os nomes que batiam sem dúvida já foram ligados sozinhos (marcados com
          <Sparkles className="mx-1 inline h-3.5 w-3.5 text-ocre-dark" />). Use “Não usar” para o que não existe aqui.
        </p>
      </div>

      <div className="inline-flex gap-0.5 rounded-[10px] border border-border bg-white p-[3px]">
        {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              'cursor-pointer rounded-[7px] px-3 py-1.5 text-sm font-semibold',
              kind === k ? 'bg-navy text-white' : 'text-navy hover:bg-paper',
            )}
          >
            {KIND_LABEL[k].tab}
            {pendingByKind[k] > 0 && (
              <span className={cn('ml-1.5 rounded-full px-1.5 text-xs', kind === k ? 'bg-ocre text-navy-deep' : 'bg-gold-soft text-ocre-dark')}>
                {pendingByKind[k]}
              </span>
            )}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-white px-6 py-10 text-center text-slate">
          <b className="mb-1 block font-serif text-lg font-semibold text-navy">Nada por aqui ainda</b>
          Os nomes aparecem quando o robô envia a primeira leitura dos diários.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface text-left text-xs text-slate">
                <th className="px-4 py-2 font-medium">No Escolar Manager</th>
                <th className="px-4 py-2 font-medium">{KIND_LABEL[kind].local}</th>
                <th className="px-4 py-2 text-right font-medium">Leituras</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((l) => {
                const pending = !l.localId && !l.ignored
                return (
                  <tr key={l.id} className={cn('border-t border-border', pending && 'bg-gold-soft/40')}>
                    <td className="px-4 py-2">
                      <span className="font-medium text-navy">{l.name}</span>
                      {kind === 'turma' && <span className="ml-2 text-xs text-slate">{l.emKey.split('|')[0]}</span>}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <select
                          aria-label={`${KIND_LABEL[kind].local} para ${l.name}`}
                          disabled={!canEdit}
                          value={l.ignored ? IGNORE : (l.localId ?? '')}
                          onChange={(e) => change(l, e.target.value)}
                          className={cn(
                            'h-8 w-full max-w-sm rounded-lg border bg-white px-2.5 text-sm text-navy outline-none focus-visible:border-ring disabled:opacity-60',
                            pending ? 'border-ocre' : 'border-input',
                          )}
                        >
                          <option value="">— sem vínculo —</option>
                          {options[kind].map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                          {l.localId && !nameById.has(l.localId) && <option value={l.localId}>(cadastro inativo)</option>}
                          <option value={IGNORE}>Não usar</option>
                        </select>
                        {l.auto && l.localId && (
                          <span title="Ligado sozinho pelo nome">
                            <Sparkles className="h-4 w-4 text-ocre-dark" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate">{l.readings}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
