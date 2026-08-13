import OverlayExpress from '@bsv/overlay-express'
import dotenv from 'dotenv'
import InvoicesLookupServiceFactory from './invoices/InvoicesLookupServiceFactory'
import InvoicesTopicManager from './invoices/InvoicesTopicManager'
import { LOOKUP_SERVICE, TOPIC } from '../../protocol/invoice'

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
    process.env.NODE_NAME || 'invoices',
    requireEnv('SERVER_PRIVATE_KEY'),
    hostingFqdn(),
    process.env.ADMIN_TOKEN
  )

  server.configurePort(Number(process.env.PORT || 8080))
  await server.configureKnex(requireEnv('KNEX_URL'))
  await server.configureMongo(requireEnv('MONGO_URL'))

  server.configureTopicManager(TOPIC, new InvoicesTopicManager())
  server.configureLookupServiceWithMongo(LOOKUP_SERVICE, InvoicesLookupServiceFactory)

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
      name: 'invoices-overlay',
      topic: TOPIC,
      lookup: LOOKUP_SERVICE
    })
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
