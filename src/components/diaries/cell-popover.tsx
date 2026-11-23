'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'

import { cn } from '@/lib/utils'
import { DIARY_STATUSES, DIARY_STATUS_INFO, monthName, type DiaryStatus } from '@/lib/diaries/status'
import type { CellValue } from '@/lib/diaries/rows'

const WIDTH = 288

export type PopoverTarget = {
  rowKey: string
  month: number
  title: string
  subtitle: string
  anchor: DOMRect
}

/**
 * Menu da célula: escolher a situação grava na hora (atalhos 1–8, 0 limpa).
 * A observação é gravada junto com a situação escolhida.
 */
export function CellPopover({
  target,
  value,
  onSelect,
  onClose,
}: {
  target: PopoverTarget
  value: CellValue | undefined
  onSelect: (status: DiaryStatus | null, notes: string | null) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const [notes, setNotes] = useState(value?.notes ?? '')
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 })

  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 360
    const { anchor } = target
    let left = anchor.left + anchor.width / 2 - WIDTH / 2
    left = Math.max(8, Math.min(left, window.innerWidth - WIDTH - 8))
    let top = anchor.bottom + 6
    if (top + h > window.innerHeight - 8) top = Math.max(8, anchor.top - h - 6)
    setPos({ top, left })
  }, [target])

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
      style={{ top: pos.top, left: pos.left, width: WIDTH }}
    >
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
  )
}
