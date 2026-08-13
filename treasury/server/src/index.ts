import path from 'node:path'
import dotenv from 'dotenv'
import { createApp } from './server.js'
import { JsonStore } from './store.js'

dotenv.config()

const port = Number(process.env.PORT || 8080)
if (!Number.isSafeInteger(port) || port <= 0) {
  throw new RangeError(`Invalid PORT: ${process.env.PORT}`)
}

const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), 'data')
const store = new JsonStore(path.join(dataDir, 'treasury.json'))
const app = createApp(store)

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Policy treasury feed listening on :${port}`)
})

const shutdown = (): void => {
  server.close(() => process.exit(0))
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
