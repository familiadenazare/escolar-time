'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Bot, Check, Eraser, X as XIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { DIARY_STATUSES, DIARY_STATUS_INFO, monthName, type DiaryStatus } from '@/lib/diaries/status'
import type { CellValue, RowReading } from '@/lib/diaries/rows'
import { saoPauloDate, suggestStatus } from '@/lib/diaries/escolar'
import { formatDateTime } from '@/lib/format-date'

const WIDTH = 288
const WIDTH_WITH_READING = 560

export type PopoverTarget = {
  rowKey: string
  month: number
  title: string
  subtitle: string
  anchor: DOMRect
}

/**
 * Menu da célula: escolher a situação grava na hora (atalhos 1–8, 0 limpa).
 * A observação é gravada junto com a situação escolhida. Com leitura do robô,
 * mostra ao lado o que está lançado no Escolar aula a aula e destaca a
 * situação que a leitura sugere — quem decide é a pessoa.
 */
export function CellPopover({
  target,
  value,
  reading,
  onSelect,
  onClose,
}: {
  target: PopoverTarget
  value: CellValue | undefined
  reading?: RowReading
  onSelect: (status: DiaryStatus | null, notes: string | null) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const [notes, setNotes] = useState(value?.notes ?? '')
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 })
  const width = reading ? WIDTH_WITH_READING : WIDTH
  const suggested = reading ? suggestStatus(reading.summary) : null

  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 360
    const { anchor } = target
    let left = anchor.left + anchor.width / 2 - width / 2
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
    let top = anchor.bottom + 6
    if (top + h > window.innerHeight - 8) top = Math.max(8, anchor.top - h - 6)
    setPos({ top, left })
  }, [target, width])

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (document.activeElement === notesRef.current) return
      if (e.key === '0' || e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        onSelect(null, null)
        return
      }
      const n = Number.parseInt(e.key, 10)
      if (n >= 1 && n <= DIARY_STATUSES.length) {
        e.preventDefault()
        onSelect(DIARY_STATUSES[n - 1], notes.trim() || null)
      }
    }
    function onScroll(e: Event) {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return
      onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onClose)
    }
  }, [notes, onClose, onSelect])

  const notesChanged = (value?.notes ?? '') !== notes.trim()

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Situação do diário em ${monthName(target.month)}`}
      className="fixed z-50 rounded-lg border border-border bg-white p-3 shadow-xl"
      style={{ top: pos.top, left: pos.left, width: Math.min(width, window.innerWidth - 16) }}
    >
      <div className={cn(reading && 'grid grid-cols-[1fr_256px] gap-4')}>
      {reading && <ReadingPanel reading={reading} />}
      <div>
      <div className="mb-2">
        <p className="text-sm font-semibold text-navy leading-tight">{target.title}</p>
        <p className="text-xs text-slate">
          {target.subtitle} · {monthName(target.month)}
        </p>
      </div>

      <ul className="space-y-0.5">
        {DIARY_STATUSES.map((s, i) => {
          const info = DIARY_STATUS_INFO[s]
          const active = value?.status === s
          return (
            <li key={s}>
              <button
                type="button"
                onClick={() => onSelect(s, notes.trim() || null)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm cursor-pointer',
                  active ? 'bg-navy/10 font-semibold text-navy' : 'text-navy hover:bg-surface',
                )}
              >
                <span className={cn('h-3 w-3 shrink-0 rounded-full', info.dot)} />
                <span className="flex-1">{info.label}</span>
                {suggested === s && (
                  <span className="rounded bg-gold-soft px-1.5 py-0.5 text-[10px] font-semibold text-ocre-dark">sugerido</span>
                )}
                <kbd className="text-[10px] text-slate">{i + 1}</kbd>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-2 border-t border-border pt-2">
        <label className="text-xs font-medium text-slate" htmlFor="diary-cell-notes">
          Observação (opcional)
        </label>
        <textarea
          id="diary-cell-notes"
          ref={notesRef}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Ex.: faltam as aulas da 2ª semana"
          className="mt-1 w-full resize-none rounded-md border border-input px-2 py-1 text-sm outline-none focus-visible:border-ring"
        />
        <div className="mt-1 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onSelect(null, null)}
            disabled={!value}
            className="flex items-center gap-1 text-xs text-slate hover:text-red-600 disabled:opacity-40 cursor-pointer disabled:cursor-default"
          >
            <Eraser className="h-3.5 w-3.5" /> Limpar
            <kbd className="ml-1 text-[10px]">0</kbd>
          </button>
          {value && notesChanged && (
            <button
              type="button"
              onClick={() => onSelect(value.status, notes.trim() || null)}
              className="rounded-md bg-navy px-2.5 py-1 text-xs font-medium text-white hover:bg-navy-light cursor-pointer"
            >
              Salvar observação
            </button>
          )}
        </div>
      </div>
      </div>
      </div>
    </div>
  )
}

/** O que o robô leu no Escolar Manager para este diário no mês. */
function ReadingPanel({ reading }: { reading: RowReading }) {
  const { summary } = reading
  const asOf = saoPauloDate(reading.readAt)
  return (
    <div className="min-w-0 border-r border-border pr-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-navy">
        <Bot className="h-3.5 w-3.5" /> No Escolar Manager
      </p>
      <p className="mb-2 text-[11px] text-slate">Lido em {formatDateTime(reading.readAt)}</p>
      <dl className="mb-2 grid grid-cols-3 gap-1 text-center">
        {(
          [
            ['Aulas', summary.lessons],
            ['Chamada', summary.attendance],
            ['Conteúdo', summary.content],
          ] as const
        ).map(([label, n]) => (
          <div key={label} className="rounded-md bg-surface px-1 py-1">
            <dt className="text-[10px] text-slate">{label}</dt>
            <dd className="text-sm font-semibold tabular-nums text-navy">{n}</dd>
          </div>
        ))}
      </dl>
      {summary.upcoming > 0 && (
        <p className="mb-2 text-[11px] text-slate">
          + {summary.upcoming} {summary.upcoming === 1 ? 'aula futura' : 'aulas futuras'} (não contam)
        </p>
      )}
      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
        {reading.parts.map((part) => (
          <div key={part.subjectLabel}>
            {reading.parts.length > 1 && (
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ocre-dark">{part.subjectLabel}</p>
            )}
            {part.lessons.length === 0 ? (
              <p className="text-xs text-slate">Nenhuma aula no mês.</p>
            ) : (
              <ul className="divide-y divide-border text-xs">
                {part.lessons.map((l, idx) => (
                  <li
                    key={`${l.date}-${idx}`}
                    className={cn('flex items-start gap-2 py-1', l.date > asOf && 'opacity-50')}
                    title={l.date > asOf ? 'Aula futura: não conta na conferência' : undefined}
                  >
                    <span className="w-10 shrink-0 tabular-nums text-slate">
                      {l.date.slice(8, 10)}/{l.date.slice(5, 7)}
                    </span>
                    <span
                      className={cn('mt-0.5 shrink-0', l.attendance ? 'text-emerald-600' : 'text-red-600')}
                      title={l.attendance ? 'Chamada lançada' : 'Sem chamada'}
                    >
                      {l.attendance ? <Check className="h-3.5 w-3.5" /> : <XIcon className="h-3.5 w-3.5" />}
                    </span>
                    <span className={cn('min-w-0 flex-1', l.content?.trim() ? 'text-navy' : 'italic text-red-600')}>
                      {l.content?.trim() || 'sem conteúdo'}
                      {l.date > asOf && <span className="ml-1 text-[10px] not-italic text-slate">(futura)</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {(part.planned != null || part.given != null) && (
              <p className="mt-1 text-[11px] text-slate">
                Previstas {part.planned ?? '—'} · realizadas {part.given ?? '—'} (período)
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
