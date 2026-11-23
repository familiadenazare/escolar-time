import { describe, expect, it } from 'vitest'

import { autoMatch, emKey, looseName, readingLevel, suggestStatus, summarizeLessons } from './escolar'

describe('nomes do Escolar', () => {
  it('chave: sem acento, maiúscula; turma leva o ano', () => {
    expect(emKey('disciplina', '  Língua  Portuguesa ')).toBe('LINGUA PORTUGUESA')
    expect(emKey('turma', '3ª Série EM', 2026)).toBe('2026|3ª SERIE EM')
  })

  it('versão solta ignora º/ª, "Ensino Médio" e pontuação', () => {
    expect(looseName('3ª SÉRIE - ENSINO MÉDIO')).toBe('3 SERIE')
    expect(looseName('1ª Série EM')).toBe('1 SERIE')
    expect(looseName('3º Ano A')).toBe('3 ANO A')
  })

  it('vínculo automático só com uma correspondência', () => {
    const turmas = [
      { id: 'a', name: '3ª Série' },
      { id: 'b', name: '3º Ano A' },
      { id: 'c', name: '3º Ano B' },
    ]
    expect(autoMatch('turma', '3ª SÉRIE - ENSINO MÉDIO', turmas)).toBe('a')
    expect(autoMatch('turma', '3º ANO', turmas)).toBeNull()
  })

  it('professor: nome curto daqui casa com o nome completo do Escolar', () => {
    const profs = [
      { id: 'r', name: 'Raynara' },
      { id: 'm1', name: 'Mariana' },
      { id: 'm2', name: 'Mariana (Infantil V)' },
    ]
    expect(autoMatch('professor', 'RAYNARA SOUZA LIMA', profs)).toBe('r')
    // Duas "Mariana" aqui: ambíguo, fica para vincular à mão.
    expect(autoMatch('professor', 'MARIANA PERROTTA', profs)).toBeNull()
  })
})

describe('leitura de um diário', () => {
  const lessons = [
    { date: '2026-11-03', attendance: true, content: 'Frações' },
    { date: '2026-11-10', attendance: true, content: null },
    { date: '2026-11-17', attendance: false, content: '  ' },
    { date: '2026-11-24', attendance: false, content: 'Planejado' },
  ]

  it('aulas depois da leitura não contam', () => {
    expect(summarizeLessons(lessons, '2026-11-20')).toEqual({ lessons: 3, attendance: 2, content: 1, upcoming: 1 })
  })

  it('sugere a situação pelo que foi lançado', () => {
    expect(suggestStatus({ lessons: 4, attendance: 4, content: 4, upcoming: 0 })).toBe('PREENCHIDO')
    expect(suggestStatus({ lessons: 4, attendance: 4, content: 0, upcoming: 0 })).toBe('FALTA_CONTEUDO')
    expect(suggestStatus({ lessons: 4, attendance: 4, content: 2, upcoming: 0 })).toBe('INCOMPLETO_CONTEUDO')
    expect(suggestStatus({ lessons: 4, attendance: 0, content: 0, upcoming: 0 })).toBe('FALTA_TUDO')
    expect(suggestStatus({ lessons: 4, attendance: 2, content: 1, upcoming: 0 })).toBe('INCOMPLETO_PRES_CONTEUDO')
    expect(suggestStatus({ lessons: 0, attendance: 0, content: 0, upcoming: 2 })).toBeNull()
    expect(readingLevel({ lessons: 4, attendance: 4, content: 4, upcoming: 0 })).toBe('full')
  })
})
