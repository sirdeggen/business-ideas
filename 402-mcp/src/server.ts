import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { HOST, PORT, PRICE_SATS, CHAIN } from './config.js'
import { indexPage } from './html.js'
import { mcpHandler } from './mcp.js'
import { requirePaidToolCall } from './payment.js'
import { getServerWallet } from './wallet.js'

export function createApp() {
  const app = express()
  const node = toNodeHandler(mcpHandler)

  app.use(
    cors({
      exposedHeaders: ['x-bsv-sats', 'x-bsv-server'],
      allowedHeaders: [
        'Content-Type',
        'Accept',
        'Mcp-Protocol-Version',
        'Mcp-Method',
        'Mcp-Name',
        'Mcp-Session-Id',
        'x-bsv-beef',
        'x-bsv-sender',
        'x-bsv-nonce',
        'x-bsv-time',
        'x-bsv-vout'
      ]
    })
  )
  app.use(express.json({ limit: '1mb' }))

  app.get('/health', (_req, res) => {
    res.json({ ok: true, priceSats: PRICE_SATS, chain: CHAIN })
  })

  app.get('/.well-known/bsv-identity', async (_req, res) => {
    try {
      const { identityKey } = await getServerWallet()
      res.json({ identityKey, priceSats: PRICE_SATS, chain: CHAIN })
    } catch {
      res.status(500).json({ error: 'server wallet unavailable' })
    }
  })

  app.get('/', (_req, res) => {
    res.type('html').send(indexPage(PRICE_SATS))
  })

  app.all('/mcp', requirePaidToolCall, (req, res) => {
    void node(req, res, req.body)
  })

  return app
}

async function main(): Promise<void> {
  const app = createApp()
  const { identityKey } = await getServerWallet()
  app.listen(PORT, HOST, () => {
    console.log(`402-mcp listening on http://${HOST}:${PORT}/mcp`)
    console.log(`chain=${CHAIN} price=${PRICE_SATS} sats/call identity=${identityKey}`)
  })
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
