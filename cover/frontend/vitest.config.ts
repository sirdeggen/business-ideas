import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@bsv\/sdk$/,
        replacement: resolve(root, 'node_modules/@bsv/sdk/dist/esm/mod.js')
      }
    ]
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', '../protocol/**/*.test.ts']
  }
})
