import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['../protocol/**/*.test.ts', 'src/**/*.test.ts', '../frontend/src/lib/**/*.test.ts']
  }
})
