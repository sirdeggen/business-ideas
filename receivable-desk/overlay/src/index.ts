import OverlayExpress from '@bsv/overlay-express'
import dotenv from 'dotenv'
import { ADVANCE_BPS, LOOKUP_SERVICE, TOPIC } from '../../protocol/receivable'
import ReceivablesLookupServiceFactory, {
  getReceivablesStorage
} from './receivables/ReceivablesLookupServiceFactory'
import ReceivablesTopicManager from './receivables/ReceivablesTopicManager'

dotenv.config()

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable ${name}`)
  return value
}

function hostingFqdn(): string {
  const raw = process.env.HOSTING_FQDN || process.env.HOSTING_URL || 'localhost'
  return raw.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

const main = async (): Promise<void> => {
  const server = new OverlayExpress(
    process.env.NODE_NAME || 'receivables',
    requireEnv('SERVER_PRIVATE_KEY'),
    hostingFqdn(),
    process.env.ADMIN_TOKEN
  )

  server.configurePort(Number(process.env.PORT || 8080))
  await server.configureKnex(requireEnv('KNEX_URL'))
  await server.configureMongo(requireEnv('MONGO_URL'))

  server.configureTopicManager(TOPIC, new ReceivablesTopicManager())
  server.configureLookupServiceWithMongo(LOOKUP_SERVICE, ReceivablesLookupServiceFactory)

  server.configureEnableGASPSync(process.env.GASP_ENABLED === 'true')
  server.configureEngineParams({
    logTime: true,
    throwOnBroadcastFailure: process.env.THROW_ON_BROADCAST_FAILURE === 'true'
  })

  if (process.env.ARC_API_KEY) {
    server.configureArcApiKey(process.env.ARC_API_KEY)
  }

  const network = process.env.NETWORK
  if (network === 'main' || network === 'test' || network === 'ttn') {
    server.configureNetwork(network)
  }

  await server.configureEngine()

  server.app.get('/version', (_req, res) => {
    res.json({
      name: 'receivable-desk-overlay',
      topic: TOPIC,
      lookup: LOOKUP_SERVICE,
      chain: 'bsv'
    })
  })

  /**
   * Stub credit-partner intent. Records 70% against an approved unpaid
   * invoice in the overlay index. Does not move sats, lend, or custody.
   */
  server.app.post('/intent', async (req, res) => {
    try {
      const invoiceId = String(req.body?.invoiceId ?? '')
      const bps = Number(req.body?.advanceBps ?? ADVANCE_BPS)
      if (!invoiceId) {
        res.status(400).json({ error: 'invoiceId required' })
        return
      }
      const storage = getReceivablesStorage()
      const record = await storage.recordAdvanceIntent(invoiceId, bps)
      res.json({
        ok: true,
        notice: 'Advance-intent recorded. No credit moved. This desk does not lend or custody funds.',
        invoiceId: record.invoiceId,
        advanceBps: record.advanceBps,
        stubAdvanceSats: Math.floor((record.amountSats * record.advanceBps) / 10000)
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      res.status(400).json({ error: message })
    }
  })

  await server.start()

  const shutdown = async (): Promise<void> => {
    await server.close()
    process.exit(0)
  }
  process.once('SIGTERM', () => { void shutdown() })
  process.once('SIGINT', () => { void shutdown() })
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
