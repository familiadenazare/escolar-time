/**
 * Nomes do Escolar Manager × cadastros daqui, e o resumo da leitura de um diário.
 * Funções puras: usadas pela API do robô, pela página e pelos testes.
 */
import type { DiaryStatus } from './status'

export type EmKind = 'turma' | 'disciplina' | 'professor'

/** Maiúsculas, sem acento, espaços simples (mesma ideia de app.nome_chave da Preceptoria). */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Chave gravada em em_links/diary_readings. Turma leva o ano (as turmas daqui são por ano letivo). */
export function emKey(kind: EmKind, name: string, year?: number): string {
  const base = normalizeName(name)
  return kind === 'turma' ? `${year ?? ''}|${base}` : base
}

/**
 * Versão "solta" para o vínculo automático: sem º/ª, sem "Ensino Médio/Fundamental",
 * sem pontuação. "3ª SÉRIE - ENSINO MÉDIO" e "3ª Série" viram "3 SERIE".
 */
export function looseName(value: string): string {
  return normalizeName(value)
    .replace(/[º°ª]/g, '')
    .replace(/\bENSINO (MEDIO|FUNDAMENTAL( I{1,2})?)\b/g, ' ')
    .replace(/\b(EM|EF|EF I|EF II)\b$/g, ' ')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export type LocalCandidate = { id: string; name: string }

/**
 * Cadastro daqui que corresponde ao nome do Escolar, se houver exatamente um.
 * Professor: os nomes daqui costumam ser curtos ("Raynara") e os do Escolar
 * completos ("RAYNARA SOUZA LIMA") — vale se um começar pelas palavras do outro.
 */
export function autoMatch(kind: EmKind, emName: string, candidates: LocalCandidate[]): string | null {
  const target = looseName(emName)
  if (!target) return null

  let matches = candidates.filter((c) => looseName(c.name) === target)
  if (matches.length === 0 && kind === 'professor') {
    const words = (s: string) => looseName(s).split(' ')
    const tw = words(emName)
    // Dois professores daqui com o mesmo primeiro nome ("Mariana" e "Mariana
    // (Infantil V)"): ambíguo, fica para vincular à mão.
    if (candidates.filter((c) => words(c.name)[0] === tw[0]).length > 1) return null
    matches = candidates.filter((c) => {
      const cw = words(c.name)
      const [short, long] = cw.length <= tw.length ? [cw, tw] : [tw, cw]
      return short.length > 0 && short.every((w, i) => long[i] === w)
    })
  }
  return matches.length === 1 ? matches[0].id : null
}

// ─── leitura de um diário ─────────────────────────────────────────────────────

export type ReadingLesson = {
  /** AAAA-MM-DD */
  date: string
  attendance: boolean
  content: string | null
}

export type ReadingSummary = {
  /** Aulas até a data da leitura (as futuras não contam: o professor pode lançar o planejamento antes). */
  lessons: number
  attendance: number
  content: number
  /** Aulas com data depois da leitura. */
  upcoming: number
}

export function summarizeLessons(lessons: ReadingLesson[], asOf: string): ReadingSummary {
  const s: ReadingSummary = { lessons: 0, attendance: 0, content: 0, upcoming: 0 }
  for (const l of lessons) {
    if (l.date > asOf) {
      s.upcoming++
      continue
    }
    s.lessons++
    if (l.attendance) s.attendance++
    if (l.content && l.content.trim()) s.content++
  }
  return s
}

export function addSummaries(a: ReadingSummary, b: ReadingSummary): ReadingSummary {
  return {
    lessons: a.lessons + b.lessons,
    attendance: a.attendance + b.attendance,
    content: a.content + b.content,
    upcoming: a.upcoming + b.upcoming,
  }
}

/** Situação que a leitura sugere. Quem decide é a pessoa que confere. */
export function suggestStatus(s: ReadingSummary): DiaryStatus | null {
  if (s.lessons === 0) return null
  const fullAttendance = s.attendance === s.lessons
  if (fullAttendance && s.content === s.lessons) return 'PREENCHIDO'
  if (fullAttendance && s.content === 0) return 'FALTA_CONTEUDO'
  if (fullAttendance) return 'INCOMPLETO_CONTEUDO'
  if (s.attendance === 0 && s.content === 0) return 'FALTA_TUDO'
  return 'INCOMPLETO_PRES_CONTEUDO'
}

/** completo / parcial / vazio — cor do indicador na célula. */
export function readingLevel(s: ReadingSummary): 'none' | 'full' | 'partial' | 'empty' {
  if (s.lessons === 0) return 'none'
  if (s.attendance === s.lessons && s.content === s.lessons) return 'full'
  if (s.attendance === 0 && s.content === 0) return 'empty'
  return 'partial'
}

/** Data (AAAA-MM-DD) de um instante no fuso de Brasília. */
export function saoPauloDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
}
