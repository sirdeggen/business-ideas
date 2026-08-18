import OverlayExpress from '@bsv/overlay-express'
import dotenv from 'dotenv'
import { LOOKUP_SERVICE, TOPIC } from '../../protocol/record'
import RecordsLookupServiceFactory from './records/RecordsLookupServiceFactory'
import RecordsTopicManager from './records/RecordsTopicManager'

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
    process.env.NODE_NAME || 'records',
    requireEnv('SERVER_PRIVATE_KEY'),
    hostingFqdn(),
    process.env.ADMIN_TOKEN
  )

  server.configurePort(Number(process.env.PORT || 8080))
  await server.configureKnex(requireEnv('KNEX_URL'))
  await server.configureMongo(requireEnv('MONGO_URL'))

  server.configureTopicManager(TOPIC, new RecordsTopicManager())
  server.configureLookupServiceWithMongo(LOOKUP_SERVICE, RecordsLookupServiceFactory)

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

  const live = { status: 'ok', live: true }
  server.app.get('/health/live', (_req, res) => {
    res.json(live)
  })
  server.app.get('/health', (_req, res) => {
    res.json(live)
  })
  server.app.get('/version', (_req, res) => {
    res.json({
      name: 'record-desk-overlay',
      topic: TOPIC,
      lookup: LOOKUP_SERVICE,
      chain: 'bsv'
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
