/**
 * Situações de um diário no mês — o vocabulário da planilha "RELATÓRIO DIÁRIOS".
 * A ordem é a do menu de marcação. Precisa bater com o CHECK de diary_checks
 * (migration 010).
 */
export const DIARY_STATUSES = [
  'ASSINADO',
  'PREENCHIDO',
  'INCOMPLETO_CONTEUDO',
  'INCOMPLETO_PRES_CONTEUDO',
  'FALTA_CONTEUDO',
  'FALTA_TUDO',
  'FERIAS',
  'LICENCA',
] as const

export type DiaryStatus = (typeof DIARY_STATUSES)[number]

/** ok = em dia; pending = cobrar do professor; na = não se aplica no mês. */
export type DiaryStatusKind = 'ok' | 'pending' | 'na'

type StatusInfo = {
  /** Nome completo (menu, legenda, mensagens). */
  label: string
  /** Texto curto que cabe na célula da grade. */
  short: string
  /** Como aparecia na planilha. */
  sheet: string
  kind: DiaryStatusKind
  /** Classes da célula (fundo + texto). */
  cell: string
  /** Bolinha da legenda e do menu. */
  dot: string
}

export const DIARY_STATUS_INFO: Record<DiaryStatus, StatusInfo> = {
  ASSINADO: {
    label: 'Assinado',
    short: 'Assinado',
    sheet: 'ASSINADO',
    kind: 'ok',
    cell: 'bg-emerald-600 text-white',
    dot: 'bg-emerald-600',
  },
  PREENCHIDO: {
    label: 'Preenchido (falta assinar)',
    short: 'Preenchido',
    sheet: 'PREENCHIDO',
    kind: 'ok',
    cell: 'bg-emerald-100 text-emerald-800',
    dot: 'bg-emerald-300',
  },
  INCOMPLETO_CONTEUDO: {
    label: 'Conteúdo incompleto',
    short: 'Cont. incompl.',
    sheet: 'INCOMPLETO CONTEÚDO',
    kind: 'pending',
    cell: 'bg-amber-100 text-amber-900',
    dot: 'bg-amber-400',
  },
  INCOMPLETO_PRES_CONTEUDO: {
    label: 'Presença e conteúdo incompletos',
    short: 'Pres.+cont. inc.',
    sheet: 'PRES + CONTEÚDO - INCOMPLETO',
    kind: 'pending',
    cell: 'bg-orange-100 text-orange-900',
    dot: 'bg-orange-400',
  },
  FALTA_CONTEUDO: {
    label: 'Falta lançar o conteúdo',
    short: 'Falta conteúdo',
    sheet: 'CONTEÚDO',
    kind: 'pending',
    cell: 'bg-orange-200 text-orange-950',
    dot: 'bg-orange-600',
  },
  FALTA_TUDO: {
    label: 'Falta tudo (nada lançado)',
    short: 'Falta tudo',
    sheet: 'TUDO',
    kind: 'pending',
    cell: 'bg-red-100 text-red-800',
    dot: 'bg-red-600',
  },
  FERIAS: {
    label: 'Férias escolares',
    short: 'Férias',
    sheet: 'FÉRIAS ESCOLAR',
    kind: 'na',
    cell: 'bg-slate-100 text-slate-500',
    dot: 'bg-slate-300',
  },
  LICENCA: {
    label: 'Licença / afastamento',
    short: 'Licença',
    sheet: 'LICENÇA MATERNIDADE',
    kind: 'na',
    cell: 'bg-sky-100 text-sky-800',
    dot: 'bg-sky-400',
  },
}

export function isDiaryStatus(value: unknown): value is DiaryStatus {
  return typeof value === 'string' && (DIARY_STATUSES as readonly string[]).includes(value)
}

export const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const

export const MONTHS_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
] as const

export function monthName(month: number): string {
  return MONTHS[month - 1] ?? String(month)
}
