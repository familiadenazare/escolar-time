'use client'

import { useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Bot, History, Link2, Loader2, PaintBucket, Plus, Trash2, UserX, X } from 'lucide-react'
import { toast } from 'sonner'

import { useCanEdit } from '@/components/auth/can-edit'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  DIARY_STATUSES,
  DIARY_STATUS_INFO,
  MONTHS,
  MONTHS_SHORT,
  monthName,
  type DiaryStatus,
} from '@/lib/diaries/status'
import {
  attachReadings,
  buildDiaryRows,
  cellKey,
  checksToCells,
  pendingByTeacher,
  rowKey,
  summarizeMonth,
  type CellValue,
  type CheckInput,
  type ClassInput,
  type DiaryRow,
  type ExtraRowInput,
  type NamedRef,
  type ReadingInput,
  type RowReading,
} from '@/lib/diaries/rows'
import { readingLevel } from '@/lib/diaries/escolar'
import { formatDateTime } from '@/lib/format-date'
import {
  addExtraRow,
  bulkSetDiaryCells,
  removeExtraRow,
  setDiaryCell,
} from '@/app/(dashboard)/dashboard/diaries/actions'
import { CellPopover, type PopoverTarget } from './cell-popover'
import { PendingView } from './pending-view'

type Unit = { id: string; name: string; code: string }

const SELECT_CLS = cn(
  'h-8 rounded-lg border border-input bg-white px-2.5 py-1 text-sm text-navy',
  'outline-none focus-visible:border-ring disabled:opacity-50',
)

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

/** Infantil → Anos (Fund.) → Séries (Médio), como na planilha. */
function classRank(name: string): number {
  const n = name.toLowerCase()
  if (n.includes('infantil')) return 0
  if (n.includes('ano')) return 1
  if (n.includes('série') || n.includes('serie')) return 2
  return 3
}

function sortClasses<T extends { name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => classRank(a.name) - classRank(b.name) || collator.compare(a.name, b.name))
}

function unitShort(unit: Unit | undefined): string {
  if (!unit) return ''
  const m = unit.name.match(/^UNIDADE\s+([IVX]+)/i)
  return m ? `Unidade ${m[1].toUpperCase()}` : unit.code
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-navy">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate hover:text-navy cursor-pointer" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-6">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium text-slate">{label}</span>
      {children}
    </label>
  )
}

export function DiariesBoard({
  year,
  years,
  units,
  classes,
  teachers,
  subjects,
  checks,
  extraRows: initialExtraRows,
  readings,
  pendingLinks,
  lastRead,
  loadError,
}: {
  year: number
  years: number[]
  units: Unit[]
  classes: ClassInput[]
  teachers: NamedRef[]
  subjects: NamedRef[]
  checks: CheckInput[]
  extraRows: ExtraRowInput[]
  readings: ReadingInput[]
  pendingLinks: number
  lastRead: string | null
  loadError: string | null
}) {
  const canEdit = useCanEdit()
  const router = useRouter()
  const pathname = usePathname()
  const [, startTransition] = useTransition()

  const now = new Date()
  const defaultMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12

  const [tab, setTab] = useState<'grid' | 'pending'>('grid')
  const [unitId, setUnitId] = useState('')
  const [classId, setClassId] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [focusMonth, setFocusMonth] = useState(defaultMonth)

  const [cells, setCells] = useState<Map<string, CellValue>>(() => checksToCells(checks))
  const [extraRows, setExtraRows] = useState<ExtraRowInput[]>(initialExtraRows)
  const [popover, setPopover] = useState<PopoverTarget | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [addFor, setAddFor] = useState<ClassInput | null>(null)

  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units])
  const sortedClasses = useMemo(() => sortClasses(classes), [classes])
  const classNameById = useMemo(() => new Map(classes.map((c) => [c.id, c.name])), [classes])

  // Linhas por turma. Recalcula a cada célula marcada (centenas de linhas — barato)
  // para que um diário fora das Atribuições com verificação vire "histórico".
  const rowsByClass = useMemo(() => {
    const cellChecks: CheckInput[] = []
    for (const [key, v] of cells) {
      const [rk, m] = key.split('#')
      const [cg, t, s] = rk.split('|')
      cellChecks.push({
        classGroupId: cg,
        teacherId: t,
        subjectId: s === 'regente' ? null : s,
        month: Number(m),
        status: v.status,
        notes: v.notes,
      })
    }
    return buildDiaryRows({ classes, teachers, subjects, checks: cellChecks, extraRows })
  }, [classes, teachers, subjects, cells, extraRows])

  // Leitura do robô no Escolar, ligada à linha certa de cada turma.
  const subjectNameById = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects])
  const readingCells = useMemo(
    () => attachReadings(rowsByClass, readings, subjectNameById).cells,
    [rowsByClass, readings, subjectNameById],
  )

  const visibleClasses = useMemo(
    () =>
      sortedClasses.filter(
        (c) => (!unitId || c.unitId === unitId) && (!classId || c.id === classId),
      ),
    [sortedClasses, unitId, classId],
  )

  const visibleRowsByClass = useMemo(() => {
    const out: { cls: ClassInput; rows: DiaryRow[] }[] = []
    for (const cls of visibleClasses) {
      const rows = (rowsByClass.get(cls.id) ?? []).filter((r) => !teacherId || r.teacherId === teacherId)
      if (rows.length || !teacherId) out.push({ cls, rows })
    }
    return out
  }, [visibleClasses, rowsByClass, teacherId])

  const visibleRows = useMemo(() => visibleRowsByClass.flatMap((g) => g.rows), [visibleRowsByClass])
  const summary = useMemo(() => summarizeMonth(visibleRows, cells, focusMonth), [visibleRows, cells, focusMonth])
  const pending = useMemo(
    () => pendingByTeacher(visibleRows, cells, focusMonth, classNameById),
    [visibleRows, cells, focusMonth, classNameById],
  )

  const teachersInScope = useMemo(() => {
    const ids = new Set<string>()
    for (const cls of visibleClasses) for (const r of rowsByClass.get(cls.id) ?? []) ids.add(r.teacherId)
    return teachers.filter((t) => ids.has(t.id))
  }, [visibleClasses, rowsByClass, teachers])

  // ── gravação ────────────────────────────────────────────────────────────────
  function saveCell(row: DiaryRow, month: number, status: DiaryStatus | null, notes: string | null) {
    const key = cellKey(row.key, month)
    const previous = cells.get(key)
    setCells((m) => {
      const next = new Map(m)
      if (status) next.set(key, { status, notes })
      else next.delete(key)
      return next
    })
    startTransition(async () => {
      const res = await setDiaryCell({
        classGroupId: row.classGroupId,
        teacherId: row.teacherId,
        subjectId: row.subjectId,
        year,
        month,
        status,
        notes,
      })
      if (!res.success) {
        toast.error(res.error ?? 'Não foi possível salvar.')
        setCells((m) => {
          const next = new Map(m)
          if (previous) next.set(key, previous)
          else next.delete(key)
          return next
        })
      }
    })
  }

  const popoverRow = useMemo(() => {
    if (!popover) return null
    for (const rows of rowsByClass.values()) {
      const r = rows.find((x) => x.key === popover.rowKey)
      if (r) return r
    }
    return null
  }, [popover, rowsByClass])

  function closePopover() {
    setPopover(null)
  }
  function onPopoverSelect(status: DiaryStatus | null, notes: string | null) {
    if (popover && popoverRow) saveCell(popoverRow, popover.month, status, notes)
    setPopover(null)
  }

  function openCell(e: React.MouseEvent<HTMLButtonElement>, row: DiaryRow, month: number) {
    if (!canEdit) return
    setPopover({
      rowKey: row.key,
      month,
      title: `${classNameById.get(row.classGroupId)} · ${row.subjectLabel}`,
      subtitle: row.teacherName,
      anchor: e.currentTarget.getBoundingClientRect(),
    })
  }

  async function handleRemoveExtra(row: DiaryRow) {
    if (!row.extraRowId) return
    const id = row.extraRowId
    const res = await removeExtraRow(id)
    if (!res.success) {
      toast.error(res.error ?? 'Não foi possível remover.')
      return
    }
    setExtraRows((list) => list.filter((x) => x.id !== id))
    toast.success('Linha removida da lista')
  }

  function changeYear(value: string) {
    router.push(`${pathname}?ano=${value}`)
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Verificação de Diários</h1>
          <p className="mt-1 text-sm text-slate">
            Situação mensal dos diários de classe. Turmas, professores e disciplinas vêm dos cadastros e das
            Atribuições.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Ano letivo"
            className={SELECT_CLS}
            value={year}
            onChange={(e) => changeYear(e.target.value)}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {canEdit && (
            <Button variant="outline" onClick={() => setBulkOpen(true)}>
              <PaintBucket /> Preencher mês
            </Button>
          )}
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Erro ao carregar os diários: {loadError}
        </div>
      )}

      <RobotBanner lastRead={lastRead} pendingLinks={pendingLinks} canEdit={canEdit} />

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface px-4 py-3">
        <Field label="Unidade">
          <select
            className={SELECT_CLS}
            value={unitId}
            onChange={(e) => {
              setUnitId(e.target.value)
              setClassId('')
            }}
          >
            <option value="">Todas</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {unitShort(u)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Turma">
          <select className={SELECT_CLS} value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Todas</option>
            {sortedClasses
              .filter((c) => !unitId || c.unitId === unitId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Professor">
          <select className={SELECT_CLS} value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            <option value="">Todos</option>
            {teachersInScope.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mês do resumo">
          <select
            className={SELECT_CLS}
            value={focusMonth}
            onChange={(e) => setFocusMonth(Number(e.target.value))}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        {(unitId || classId || teacherId) && (
          <button
            type="button"
            onClick={() => {
              setUnitId('')
              setClassId('')
              setTeacherId('')
            }}
            className="h-8 text-xs text-slate hover:text-navy cursor-pointer"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Resumo do mês */}
      <MonthSummaryBar summary={summary} month={focusMonth} />

      {/* Abas */}
      <div className="flex gap-1 border-b border-border">
        {(
          [
            ['grid', 'Grade anual'],
            ['pending', `Pendências de ${monthName(focusMonth).toLowerCase()}`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium cursor-pointer',
              tab === id ? 'border-ocre text-navy' : 'border-transparent text-slate hover:text-navy',
            )}
          >
            {label}
            {id === 'pending' && pending.length > 0 && (
              <span className="ml-2 rounded-full bg-red-100 px-1.5 text-xs text-red-700">{pending.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'pending' ? (
        <PendingView pending={pending} month={focusMonth} year={year} unchecked={summary.unchecked} />
      ) : (
        <>
          <Legend />
          {visibleRowsByClass.length === 0 && (
            <p className="py-12 text-center text-sm text-slate">
              {classes.length === 0
                ? `Nenhuma turma ativa cadastrada para ${year}.`
                : 'Nenhum diário com esses filtros.'}
            </p>
          )}
          <div className="space-y-6">
            {visibleRowsByClass.map(({ cls, rows }) => (
              <ClassTable
                key={cls.id}
                cls={cls}
                unitLabel={unitId ? '' : unitShort(unitById.get(cls.unitId))}
                rows={rows}
                cells={cells}
                readings={readingCells}
                currentMonth={year === now.getFullYear() ? now.getMonth() + 1 : 0}
                focusMonth={focusMonth}
                canEdit={canEdit}
                activeCell={popover ? cellKey(popover.rowKey, popover.month) : null}
                onCellClick={openCell}
                onAdd={() => setAddFor(cls)}
                onRemoveExtra={handleRemoveExtra}
              />
            ))}
          </div>
        </>
      )}

      {popover && popoverRow && (
        <CellPopover
          key={cellKey(popover.rowKey, popover.month)}
          target={popover}
          value={cells.get(cellKey(popover.rowKey, popover.month))}
          reading={readingCells.get(cellKey(popover.rowKey, popover.month))}
          onSelect={onPopoverSelect}
          onClose={closePopover}
        />
      )}

      {bulkOpen && (
        <BulkFillModal
          rows={visibleRows}
          cells={cells}
          defaultMonth={focusMonth}
          scopeLabel={
            [
              classId ? classNameById.get(classId) : unitId ? unitShort(unitById.get(unitId)) : 'todas as turmas',
              teacherId ? teachers.find((t) => t.id === teacherId)?.name : null,
            ]
              .filter(Boolean)
              .join(' · ')
          }
          onClose={() => setBulkOpen(false)}
          onApply={async (month, status, onlyEmpty) => {
            const target = visibleRows.filter((r) => !onlyEmpty || !cells.has(cellKey(r.key, month)))
            if (target.length === 0) {
              toast.info('Nenhum diário para preencher.')
              return
            }
            const res = await bulkSetDiaryCells({
              year,
              month,
              status,
              rows: target.map((r) => ({ classGroupId: r.classGroupId, teacherId: r.teacherId, subjectId: r.subjectId })),
            })
            if (!res.success) {
              toast.error(res.error ?? 'Não foi possível preencher.')
              return
            }
            setCells((m) => {
              const next = new Map(m)
              for (const r of target) {
                const k = cellKey(r.key, month)
                next.set(k, { status, notes: m.get(k)?.notes ?? null })
              }
              return next
            })
            toast.success(`${target.length} diários marcados como “${DIARY_STATUS_INFO[status].short}” em ${monthName(month).toLowerCase()}`)
            setBulkOpen(false)
          }}
        />
      )}

      {addFor && (
        <AddRowModal
          cls={addFor}
          teachers={teachers}
          subjects={subjects}
          existing={new Set((rowsByClass.get(addFor.id) ?? []).map((r) => r.key))}
          onClose={() => setAddFor(null)}
          onAdd={async (tId, sId, notes) => {
            const res = await addExtraRow({ classGroupId: addFor.id, teacherId: tId, subjectId: sId, year, notes })
            if (!res.success || !res.id) {
              toast.error(res.error ?? 'Não foi possível adicionar.')
              return
            }
            setExtraRows((list) => [
              ...list,
              { id: res.id!, classGroupId: addFor.id, teacherId: tId, subjectId: sId, notes },
            ])
            toast.success('Diário adicionado')
            setAddFor(null)
          }}
        />
      )}
    </div>
  )
}

// ─── leitura do robô ────────────────────────────────────────────────────────

function RobotBanner({ lastRead, pendingLinks, canEdit }: { lastRead: string | null; pendingLinks: number; canEdit: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-white px-4 py-2.5 text-sm">
      <div className="flex min-w-0 flex-1 items-start gap-2 text-slate">
        <Bot className="mt-0.5 h-4 w-4 flex-none text-navy" />
        <p className="min-w-0">
          {lastRead ? (
            <>
              Leitura do Escolar Manager pelo robô em{' '}
              <b className="font-semibold text-navy">{formatDateTime(lastRead)}</b>. Cada célula mostra chamada (ch) e
              conteúdo (ct) lançados nas aulas que já passaram.
            </>
          ) : (
            'O robô ainda não enviou leituras do Escolar Manager. Por enquanto a conferência é só manual.'
          )}
        </p>
      </div>
      {pendingLinks > 0 && (
        <Link
          href="/dashboard/diaries/vinculos"
          className="ml-auto flex items-center gap-1.5 rounded-full bg-gold-soft px-3 py-1 text-xs font-semibold text-ocre-dark hover:bg-ocre/20"
        >
          <Link2 className="h-3.5 w-3.5" />
          {pendingLinks} {pendingLinks === 1 ? 'nome do Escolar sem vínculo' : 'nomes do Escolar sem vínculo'}
          {canEdit ? ' — vincular' : ''}
        </Link>
      )}
      {pendingLinks === 0 && lastRead && (
        <Link href="/dashboard/diaries/vinculos" className="ml-auto text-xs text-slate underline-offset-2 hover:text-navy hover:underline">
          Vínculos com o Escolar
        </Link>
      )}
    </div>
  )
}

// ─── resumo ─────────────────────────────────────────────────────────────────

function MonthSummaryBar({ summary, month }: { summary: ReturnType<typeof summarizeMonth>; month: number }) {
  const applicable = summary.total - summary.na
  const pct = applicable > 0 ? Math.round((summary.ok / applicable) * 100) : 0
  const items: [string, number, string][] = [
    ['Em dia', summary.ok, 'text-emerald-700'],
    ['Com pendência', summary.pending, 'text-red-700'],
    ['Não verificados', summary.unchecked, 'text-ocre-dark'],
    ['Não se aplica', summary.na, 'text-slate'],
  ]
  return (
    <div className="rounded-lg border border-border bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
        <div>
          <p className="text-xs text-slate">{monthName(month)}</p>
          <p className="text-2xl font-bold text-navy tabular-nums">
            {pct}% <span className="text-sm font-normal text-slate">em dia</span>
          </p>
        </div>
        {items.map(([label, value, color]) => (
          <div key={label}>
            <p className="text-xs text-slate">{label}</p>
            <p className={cn('text-xl font-semibold tabular-nums', color)}>{value}</p>
          </div>
        ))}
        <div className="ml-auto text-xs text-slate">{summary.total} diários no filtro</div>
      </div>
      {summary.total > 0 && (
        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
          {DIARY_STATUSES.map((s) =>
            summary.byStatus[s] > 0 ? (
              <div
                key={s}
                className={DIARY_STATUS_INFO[s].dot}
                style={{ width: `${(summary.byStatus[s] / summary.total) * 100}%` }}
                title={`${DIARY_STATUS_INFO[s].label}: ${summary.byStatus[s]}`}
              />
            ) : null,
          )}
        </div>
      )}
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate">
      {DIARY_STATUSES.map((s) => (
        <span key={s} className="flex items-center gap-1.5" title={`Na planilha: ${DIARY_STATUS_INFO[s].sheet}`}>
          <span className={cn('h-2.5 w-2.5 rounded-full', DIARY_STATUS_INFO[s].dot)} />
          {DIARY_STATUS_INFO[s].label}
        </span>
      ))}
    </div>
  )
}

// ─── tabela de uma turma ─────────────────────────────────────────────────────

function ClassTable({
  cls,
  unitLabel,
  rows,
  cells,
  readings,
  currentMonth,
  focusMonth,
  canEdit,
  activeCell,
  onCellClick,
  onAdd,
  onRemoveExtra,
}: {
  cls: ClassInput
  unitLabel: string
  rows: DiaryRow[]
  cells: Map<string, CellValue>
  readings: Map<string, RowReading>
  currentMonth: number
  focusMonth: number
  canEdit: boolean
  activeCell: string | null
  onCellClick: (e: React.MouseEvent<HTMLButtonElement>, row: DiaryRow, month: number) => void
  onAdd: () => void
  onRemoveExtra: (row: DiaryRow) => void
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <header className="flex items-center justify-between gap-2 bg-navy px-4 py-2">
        <h2 className="font-semibold text-white">
          {cls.name}
          {unitLabel && <span className="ml-2 text-xs font-normal text-white/60">{unitLabel}</span>}
        </h2>
        {canEdit && (
          <button
            type="button"
            onClick={onAdd}
            className="flex items-center gap-1 text-xs text-white/80 hover:text-white cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar diário
          </button>
        )}
      </header>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-surface text-xs text-slate">
              <th className="sticky left-0 z-10 min-w-48 bg-surface px-3 py-1.5 text-left font-medium">Disciplina</th>
              <th className="min-w-36 px-3 py-1.5 text-left font-medium">Professor</th>
              {MONTHS_SHORT.map((m, i) => (
                <th
                  key={m}
                  className={cn(
                    'min-w-[5.5rem] px-1 py-1.5 text-center font-medium',
                    i + 1 === currentMonth && 'text-navy',
                    i + 1 === focusMonth && 'bg-ocre/15',
                  )}
                >
                  {m}
                </th>
              ))}
              {canEdit && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={15} className="px-3 py-4 text-center text-xs text-slate">
                  Nenhuma disciplina atribuída a esta turma. Cadastre em Atribuições ou adicione um diário.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.key} className={cn('border-t border-border', row.origin === 'history' && 'bg-slate-50/70')}>
                <td className="sticky left-0 z-10 bg-white px-3 py-1.5 align-middle">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn('font-medium', row.origin === 'history' ? 'text-slate' : 'text-navy')}
                      title={row.regenteSubjects.length ? row.regenteSubjects.join(', ') : undefined}
                    >
                      {row.subjectLabel}
                    </span>
                    {row.origin === 'history' && (
                      <span
                        className="flex items-center gap-0.5 rounded bg-slate-200 px-1 text-[10px] text-slate-600"
                        title="Não está mais nas Atribuições, mas tem verificações neste ano."
                      >
                        <History className="h-3 w-3" /> histórico
                      </span>
                    )}
                    {row.origin === 'manual' && (
                      <span
                        className="rounded bg-sky/30 px-1 text-[10px] text-navy"
                        title={row.extraNotes ?? 'Acrescentado à mão (fora das Atribuições).'}
                      >
                        manual
                      </span>
                    )}
                  </div>
                  {row.regenteSubjects.length > 0 && (
                    <p className="max-w-56 truncate text-[11px] text-slate" title={row.regenteSubjects.join(', ')}>
                      {row.regenteSubjects.join(', ')}
                    </p>
                  )}
                  {row.extraNotes && row.origin !== 'manual' && (
                    <p className="text-[11px] text-slate">{row.extraNotes}</p>
                  )}
                </td>
                <td className="px-3 py-1.5 align-middle">
                  <span className={cn('flex items-center gap-1', row.teacherActive ? 'text-navy' : 'text-slate line-through')}>
                    {!row.teacherActive && <UserX className="h-3.5 w-3.5 no-underline" aria-label="Professor inativo" />}
                    {row.teacherName}
                  </span>
                  {row.origin === 'manual' && row.extraNotes && (
                    <p className="text-[11px] text-slate">{row.extraNotes}</p>
                  )}
                </td>
                {MONTHS_SHORT.map((m, i) => {
                  const month = i + 1
                  const key = cellKey(row.key, month)
                  const cell = cells.get(key)
                  const info = cell ? DIARY_STATUS_INFO[cell.status] : null
                  const reading = readings.get(key)
                  const level = reading ? readingLevel(reading.summary) : null
                  const readingText = reading
                    ? reading.summary.lessons === 0
                      ? 'sem aulas'
                      : `ch ${reading.summary.attendance}/${reading.summary.lessons} · ct ${reading.summary.content}/${reading.summary.lessons}`
                    : null
                  const readingTip = reading
                    ? reading.summary.lessons === 0
                      ? 'Escolar: nenhuma aula até a data da leitura'
                      : `Escolar: chamada em ${reading.summary.attendance} e conteúdo em ${reading.summary.content} de ${reading.summary.lessons} aulas`
                    : null
                  const tip = [
                    cell ? `${info!.label}${cell.notes ? ` — ${cell.notes}` : ''}` : canEdit ? 'Clique para marcar' : 'Não verificado',
                    readingTip,
                  ]
                    .filter(Boolean)
                    .join('\n')
                  return (
                    <td key={m} className={cn('p-0.5', month === focusMonth && 'bg-ocre/10')}>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={(e) => onCellClick(e, row, month)}
                        title={tip}
                        aria-label={`${row.subjectLabel}, ${row.teacherName}, ${MONTHS[i]}: ${cell ? info!.label : 'não verificado'}${readingTip ? `. ${readingTip}` : ''}`}
                        className={cn(
                          'relative flex w-full flex-col items-center justify-center rounded px-1 text-[11px] font-medium leading-tight',
                          reading ? 'h-10' : 'h-8',
                          info ? info.cell : 'text-slate-300',
                          !info && level && 'border bg-white',
                          !info && level === 'full' && 'border-emerald-300',
                          !info && level === 'partial' && 'border-amber-300',
                          !info && level === 'empty' && 'border-red-300',
                          !info && level === 'none' && 'border-slate-200',
                          canEdit && 'cursor-pointer hover:ring-2 hover:ring-navy/30',
                          !info && canEdit && 'hover:bg-surface hover:text-slate',
                          activeCell === key && 'ring-2 ring-navy',
                        )}
                      >
                        {info ? <span>{info.short}</span> : !reading && '·'}
                        {readingText && (
                          <span
                            className={cn(
                              'whitespace-nowrap text-[9.5px] font-normal tabular-nums',
                              info ? 'opacity-80' : 'text-slate',
                            )}
                          >
                            {readingText}
                          </span>
                        )}
                        {cell?.notes && (
                          <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-navy" aria-hidden />
                        )}
                      </button>
                    </td>
                  )
                })}
                {canEdit && (
                  <td className="px-1 align-middle">
                    {row.extraRowId && (
                      <button
                        type="button"
                        onClick={() => onRemoveExtra(row)}
                        title="Tirar da lista (as verificações já feitas ficam no histórico)"
                        className="text-slate hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ─── modais ─────────────────────────────────────────────────────────────────

function BulkFillModal({
  rows,
  cells,
  defaultMonth,
  scopeLabel,
  onClose,
  onApply,
}: {
  rows: DiaryRow[]
  cells: Map<string, CellValue>
  defaultMonth: number
  scopeLabel: string
  onClose: () => void
  onApply: (month: number, status: DiaryStatus, onlyEmpty: boolean) => Promise<void>
}) {
  const [month, setMonth] = useState(defaultMonth)
  const [status, setStatus] = useState<DiaryStatus>('FERIAS')
  const [onlyEmpty, setOnlyEmpty] = useState(true)
  const [busy, setBusy] = useState(false)

  const count = rows.filter((r) => !onlyEmpty || !cells.has(cellKey(r.key, month))).length

  return (
    <Modal title="Preencher mês" onClose={onClose}>
      <p className="text-sm text-slate">
        Marca a mesma situação em vários diários de uma vez — por exemplo, julho como férias escolares. Vale para os
        diários do filtro atual: <span className="font-medium text-navy">{scopeLabel}</span>.
      </p>
      <Field label="Mês">
        <select className={cn(SELECT_CLS, 'w-full')} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Situação">
        <select
          className={cn(SELECT_CLS, 'w-full')}
          value={status}
          onChange={(e) => setStatus(e.target.value as DiaryStatus)}
        >
          {DIARY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {DIARY_STATUS_INFO[s].label}
            </option>
          ))}
        </select>
      </Field>
      <label className="flex items-center gap-2 text-sm text-navy">
        <input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} />
        Só diários ainda não verificados nesse mês
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          disabled={busy || count === 0}
          onClick={async () => {
            setBusy(true)
            await onApply(month, status, onlyEmpty)
            setBusy(false)
          }}
          className="bg-navy text-white hover:bg-navy-light"
        >
          {busy && <Loader2 className="animate-spin" />}
          Marcar {count} {count === 1 ? 'diário' : 'diários'}
        </Button>
      </div>
    </Modal>
  )
}

function AddRowModal({
  cls,
  teachers,
  subjects,
  existing,
  onClose,
  onAdd,
}: {
  cls: ClassInput
  teachers: NamedRef[]
  subjects: NamedRef[]
  existing: Set<string>
  onClose: () => void
  onAdd: (teacherId: string, subjectId: string | null, notes: string | null) => Promise<void>
}) {
  const [teacherId, setTeacherId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const classSubjectIds = new Set(cls.subjects.map((s) => s.subjectId))
  const subjectsSorted = [...subjects].sort(
    (a, b) =>
      Number(classSubjectIds.has(b.id)) - Number(classSubjectIds.has(a.id)) || collator.compare(a.name, b.name),
  )
  const sId = subjectId === 'regente' ? null : subjectId || undefined
  const duplicate = teacherId && sId !== undefined && existing.has(rowKey(cls.id, teacherId, sId))

  return (
    <Modal title={`Adicionar diário — ${cls.name}`} onClose={onClose}>
      <p className="text-sm text-slate">
        Para diários que não estão nas Atribuições, como o de um professor substituto. Não altera a grade de horários.
      </p>
      <Field label="Professor">
        <select className={cn(SELECT_CLS, 'w-full')} value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
          <option value="">Selecione…</option>
          {teachers
            .filter((t) => t.active !== false)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Disciplina">
        <select className={cn(SELECT_CLS, 'w-full')} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          <option value="">Selecione…</option>
          <option value="regente">Regente (todas as disciplinas da regente)</option>
          {subjectsSorted
            .filter((s) => s.active !== false)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {classSubjectIds.has(s.id) ? '' : ' (fora da turma)'}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Observação (opcional)">
        <input
          className={cn(SELECT_CLS, 'w-full')}
          value={notes}
          maxLength={200}
          placeholder="Ex.: substitui Lara (licença maternidade)"
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      {duplicate && <p className="text-xs text-red-600">Esse diário já está na lista da turma.</p>}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          disabled={busy || !teacherId || sId === undefined || !!duplicate}
          onClick={async () => {
            setBusy(true)
            await onAdd(teacherId, sId ?? null, notes.trim() || null)
            setBusy(false)
          }}
          className="bg-navy text-white hover:bg-navy-light"
        >
          {busy && <Loader2 className="animate-spin" />}
          Adicionar
        </Button>
      </div>
    </Modal>
  )
}
