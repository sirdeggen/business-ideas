import { copyFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const root = dirname(fileURLToPath(import.meta.url))

function copySpa404(): Plugin {
  return {
    name: 'copy-spa-404',
    closeBundle() {
      const index = resolve(root, 'dist/index.html')
      const dest = resolve(root, 'dist/404.html')
      if (existsSync(index)) copyFileSync(index, dest)
    }
  }
}

export default defineConfig({
  plugins: [react(), copySpa404()],
  resolve: {
    alias: [
      {
        find: /^@bsv\/sdk$/,
        replacement: resolve(root, 'node_modules/@bsv/sdk/dist/esm/mod.js')
      }
    ]
  },
  base: process.env.VITE_BASE || '/',
  server: {
    port: 5186
  }
})
