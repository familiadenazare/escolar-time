import { describe, expect, it } from 'vitest'

import { legacyRedirect } from './middleware'

describe('legacyRedirect', () => {
  it('manda o endereço antigo para o Pedagógico no mesmo caminho', () => {
    expect(legacyRedirect('horarios.familiadenazare.com.br', '/dashboard/schedules', '?x=1')).toBe(
      'https://pedagogico.familiadenazare.com.br/dashboard/schedules?x=1',
    )
    expect(legacyRedirect('HORARIOS.familiadenazare.com.br:443', '/', '')).toBe('https://pedagogico.familiadenazare.com.br/')
  })

  it('não mexe no endereço novo nem no local', () => {
    expect(legacyRedirect('pedagogico.familiadenazare.com.br', '/', '')).toBeNull()
    expect(legacyRedirect('localhost:3000', '/', '')).toBeNull()
    expect(legacyRedirect(null, '/', '')).toBeNull()
  })
})
