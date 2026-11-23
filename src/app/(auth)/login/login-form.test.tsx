import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { LoginForm } from './login-form'

describe('LoginForm', () => {
  it('leva ao login do Google pelo próprio app', () => {
    render(<LoginForm />)
    expect(screen.getByRole('button', { name: /entrar com google/i })).toHaveAttribute('href', '/auth/google')
    expect(screen.queryByLabelText(/senha/i)).toBeNull()
  })

  it('explica por que o retorno do Google recusou a conta', () => {
    render(<LoginForm callbackError="domain" />)
    expect(screen.getByText(/Use uma conta Google @familiadenazare\.com\.br/i)).toBeInTheDocument()
  })
})
