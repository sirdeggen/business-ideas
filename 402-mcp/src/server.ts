import cors from 'cors'
import express from 'express'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { HOST, PORT, PRICE_SATS, CHAIN } from './config.js'
import { mcpHandler } from './mcp.js'
import { requirePaidToolCall } from './payment.js'
import { getServerWallet } from './wallet.js'

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
  res.type('text/plain').send(
    [
      '402-mcp — paid MCP tools in sats (BRC-121, not Coinbase x402).',
      `Price: ${PRICE_SATS} sats per tools/call. initialize and tools/list are free.`,
      'MCP endpoint: POST /mcp',
      'Paid tool: extract_article (main article text).',
      'Payment is the credential. No signup, no API key.'
    ].join('\n')
  )
})

app.all('/mcp', requirePaidToolCall, (req, res) => {
  void node(req, res, req.body)
})

async function main(): Promise<void> {
  const { identityKey } = await getServerWallet()
  app.listen(PORT, HOST, () => {
    console.log(`402-mcp listening on http://${HOST}:${PORT}/mcp`)
    console.log(`chain=${CHAIN} price=${PRICE_SATS} sats/call identity=${identityKey}`)
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
