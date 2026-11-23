import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // O build (output standalone) copia src/ para .next/standalone.
    exclude: [...configDefaults.exclude, '.next/**'],
    // Subir o PGlite e aplicar as migrations demora com a suíte toda em paralelo.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
