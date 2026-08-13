import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { getAllArticles, getArticle } from './articles.js'
import { articlePage, indexPage, notFoundPage } from './html.js'
import { createPayPerCrawlMiddleware } from './payment.js'
import { crawlerSats, humanSats } from './pricing.js'
import { identityKeyFromEnv, makeWallet } from './wallet.js'

dotenv.config()

const PAYMENT_HEADERS = [
  'x-bsv-beef',
  'x-bsv-sender',
  'x-bsv-nonce',
  'x-bsv-time',
  'x-bsv-vout'
]

export function createApp() {
  const app = express()
  const requirePayment = createPayPerCrawlMiddleware()

  app.use(
    cors({
      exposedHeaders: ['x-bsv-sats', 'x-bsv-server'],
      allowedHeaders: ['Content-Type', ...PAYMENT_HEADERS]
    })
  )
  app.use(express.json())

  app.get('/', (_req, res) => {
    res.type('html').send(indexPage())
  })

  app.get('/robots.txt', (_req, res) => {
    res
      .type('text/plain')
      .send(`User-agent: *
Allow: /

# This site does not block crawlers.
# Article routes return HTTP 402 with x-bsv-sats and x-bsv-server.
# Humans pay ${humanSats()} sats. Crawlers pay ${crawlerSats()} sats.
`)
  })

  app.get('/.well-known/bsv-identity', (_req, res) => {
    try {
      res.json({ identityKey: identityKeyFromEnv() })
    } catch {
      res.status(500).json({ error: 'PRIVATE_KEY is not configured' })
    }
  })

  app.get('/articles/:slug', (req, res, next) => {
    if (!getArticle(req.params.slug)) {
      res.status(404).type('html').send(notFoundPage())
      return
    }
    next()
  }, requirePayment, (req, res) => {
    const article = getArticle(req.params.slug)
    if (!article) {
      res.status(404).type('html').send(notFoundPage())
      return
    }
    res.type('html').send(articlePage(article))
  })

  return app
}

export function listenPort(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.PORT || 3000)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new RangeError(`Invalid PORT: ${env.PORT}`)
  }
  return parsed
}

export async function startServer(env: NodeJS.ProcessEnv = process.env) {
  const app = createApp()
  const port = listenPort(env)
  const identityKey = identityKeyFromEnv(env)

  makeWallet(env).catch((error) => {
    console.error(
      'Wallet storage is not ready. 402 challenges still work; accepting payment needs STORAGE_URL.',
      error
    )
  })

  const server = createServer(app)
  await new Promise<void>((resolve) => {
    server.listen(port, () => resolve())
  })

  const slugs = getAllArticles()
    .map((article) => article.slug)
    .join(', ')
  console.log(`402 Press http://localhost:${port}`)
  console.log(`Identity ${identityKey}`)
  console.log(`Human ${humanSats(env)} sats · crawler ${crawlerSats(env)} sats`)
  console.log(`Paid routes: /articles/{${slugs}}`)
  return server
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  startServer().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
