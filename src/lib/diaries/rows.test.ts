import { describe, expect, it } from 'vitest'

import {
  buildDiaryRows,
  cellKey,
  checksToCells,
  pendingByTeacher,
  pendingMessage,
  rowKey,
  summarizeMonth,
  type CheckInput,
} from './rows'

const teachers = [
  { id: 't-sarah', name: 'Sarah', active: true },
  { id: 't-leo', name: 'Leonardo', active: true },
  { id: 't-raynara', name: 'Raynara', active: true },
  { id: 't-dayane', name: 'Dayane', active: false },
  { id: 't-lucas', name: 'Lucas Gondim', active: true },
]
const subjects = [
  { id: 's-port', name: 'Língua Portuguesa' },
  { id: 's-cien', name: 'Ciências' },
  { id: 's-mat', name: 'Matemática' },
  { id: 's-ef', name: 'Educação Física Masculina' },
  { id: 's-ing', name: 'Inglês' },
]

const terceiroA = {
  id: 'c-3a',
  name: '3º Ano A',
  unitId: 'u2',
  homeroomTeacherId: 't-sarah',
  subjects: [
    { subjectId: 's-port', teacherIds: ['t-sarah'] },
    { subjectId: 's-cien', teacherIds: ['t-sarah'] },
    { subjectId: 's-mat', teacherIds: ['t-raynara'] },
    { subjectId: 's-ef', teacherIds: ['t-leo'] },
  ],
}

describe('buildDiaryRows', () => {
  it('junta as disciplinas da regente numa linha "Regente" e mantém as demais por disciplina', () => {
    const rows = buildDiaryRows({ classes: [terceiroA], teachers, subjects, checks: [], extraRows: [] })
      .get('c-3a')!

    expect(rows.map((r) => [r.subjectLabel, r.teacherName])).toEqual([
      ['Regente', 'Sarah'],
      ['Educação Física Masculina', 'Leonardo'],
      ['Matemática', 'Raynara'],
    ])
    expect(rows[0].subjectId).toBeNull()
    expect(rows[0].regenteSubjects).toEqual(['Ciências', 'Língua Portuguesa'])
    expect(rows.every((r) => r.origin === 'assignment')).toBe(true)
  })

  it('turma sem regente (Ensino Médio) tem uma linha por disciplina', () => {
    const cls = { ...terceiroA, homeroomTeacherId: null }
    const rows = buildDiaryRows({ classes: [cls], teachers, subjects, checks: [], extraRows: [] }).get('c-3a')!
    expect(rows.map((r) => r.subjectLabel)).toEqual([
      'Ciências',
      'Educação Física Masculina',
      'Língua Portuguesa',
      'Matemática',
    ])
  })

  it('professor que saiu continua visível (histórico) se tem verificações no ano', () => {
    const checks: CheckInput[] = [
      { classGroupId: 'c-3a', teacherId: 't-dayane', subjectId: null, month: 3, status: 'ASSINADO', notes: null },
    ]
    const rows = buildDiaryRows({ classes: [terceiroA], teachers, subjects, checks, extraRows: [] }).get('c-3a')!
    const last = rows.at(-1)!
    expect(last).toMatchObject({ teacherName: 'Dayane', origin: 'history', teacherActive: false, subjectLabel: 'Regente' })
  })

  it('linha manual (substituto) entra; se repetir uma atribuída, só marca a observação', () => {
    const extraRows = [
      { id: 'x1', classGroupId: 'c-3a', teacherId: 't-lucas', subjectId: 's-ing', notes: 'Substitui Lara' },
      { id: 'x2', classGroupId: 'c-3a', teacherId: 't-raynara', subjectId: 's-mat', notes: null },
    ]
    const rows = buildDiaryRows({ classes: [terceiroA], teachers, subjects, checks: [], extraRows }).get('c-3a')!
    expect(rows).toHaveLength(4)
    expect(rows.find((r) => r.teacherId === 't-lucas')).toMatchObject({ origin: 'manual', extraRowId: 'x1', extraNotes: 'Substitui Lara' })
    expect(rows.find((r) => r.teacherId === 't-raynara')).toMatchObject({ origin: 'assignment', extraRowId: 'x2' })
  })

  it('ignora verificações de turmas fora da lista', () => {
    const checks: CheckInput[] = [
      { classGroupId: 'outra', teacherId: 't-leo', subjectId: 's-ef', month: 1, status: 'ASSINADO', notes: null },
    ]
    const map = buildDiaryRows({ classes: [terceiroA], teachers, subjects, checks, extraRows: [] })
    expect([...map.keys()]).toEqual(['c-3a'])
  })
})

describe('resumo e pendências', () => {
  const rows = buildDiaryRows({ classes: [terceiroA], teachers, subjects, checks: [], extraRows: [] }).get('c-3a')!
  const checks: CheckInput[] = [
    { classGroupId: 'c-3a', teacherId: 't-sarah', subjectId: null, month: 10, status: 'ASSINADO', notes: null },
    { classGroupId: 'c-3a', teacherId: 't-leo', subjectId: 's-ef', month: 10, status: 'FALTA_TUDO', notes: null },
    { classGroupId: 'c-3a', teacherId: 't-raynara', subjectId: 's-mat', month: 9, status: 'FALTA_CONTEUDO', notes: 'semana 2' },
  ]
  const cells = checksToCells(checks)

  it('checksToCells indexa por linha e mês', () => {
    expect(cells.get(cellKey(rowKey('c-3a', 't-leo', 's-ef'), 10))?.status).toBe('FALTA_TUDO')
  })

  it('summarizeMonth conta por tipo e não verificados', () => {
    const s = summarizeMonth(rows, cells, 10)
    expect(s).toMatchObject({ total: 3, ok: 1, pending: 1, na: 0, unchecked: 1 })
    expect(s.byStatus.FALTA_TUDO).toBe(1)
  })

  it('pendingByTeacher e mensagem de cobrança', () => {
    const names = new Map([['c-3a', '3º Ano A']])
    const list = pendingByTeacher(rows, cells, 9, names)
    expect(list).toHaveLength(1)
    expect(list[0].teacherName).toBe('Raynara')
    const msg = pendingMessage(list[0], 9, 2026)
    expect(msg).toContain('setembro/2026')
    expect(msg).toContain('• 3º Ano A — Matemática: falta lançar o conteúdo (semana 2)')
  })
})
