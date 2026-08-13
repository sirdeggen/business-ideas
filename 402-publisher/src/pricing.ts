import type { IncomingHttpHeaders } from 'node:http'

export const DEFAULT_HUMAN_SATS = 100
export const DEFAULT_CRAWLER_SATS = 500

/** User-Agents priced as crawlers. Browsers and BSV Browser stay on the human price. */
const CRAWLER_UA_MARKERS = [
  'gptbot',
  'claudebot',
  'anthropic-ai',
  'googlebot',
  'bingbot',
  'slurp',
  'duckduckbot',
  'baiduspider',
  'yandexbot',
  'amazonbot',
  'applebot',
  'bytespider',
  'ccbot',
  'cohere-ai',
  'perplexitybot',
  'facebookexternalhit',
  'twitterbot',
  'linkedinbot',
  'curl',
  'wget',
  'python-requests',
  'python-urllib',
  'go-http-client',
  'httpie',
  'aiohttp',
  'httpx',
  'scrapy',
  'node-fetch',
  'undici',
  'axios',
  'okhttp',
  'java/'
]

export type HeaderBag = IncomingHttpHeaders | Record<string, string | string[] | undefined>

function headerValue(headers: HeaderBag, name: string): string {
  const raw = headers[name] ?? headers[name.toLowerCase()]
  if (Array.isArray(raw)) return raw[0] ?? ''
  return raw ?? ''
}

function parseSats(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new RangeError(`Invalid satoshi price: ${value}`)
  }
  return parsed
}

export function humanSats(env: NodeJS.ProcessEnv = process.env): number {
  return parseSats(env.HUMAN_SATS, DEFAULT_HUMAN_SATS)
}

export function crawlerSats(env: NodeJS.ProcessEnv = process.env): number {
  return parseSats(env.CRAWLER_SATS, DEFAULT_CRAWLER_SATS)
}

/**
 * Crawlers: known bot/tool User-Agents, missing UA, or a non-browser Accept
 * (application/json without text/html). Mozilla browsers and BSV Browser stay human.
 */
export function isCrawler(headers: HeaderBag): boolean {
  const userAgent = headerValue(headers, 'user-agent').toLowerCase()
  const accept = headerValue(headers, 'accept').toLowerCase()

  if (userAgent.includes('bsv-browser') || userAgent.includes('bsv browser')) {
    return false
  }

  if (!userAgent.trim()) return true
  if (CRAWLER_UA_MARKERS.some((marker) => userAgent.includes(marker))) return true
  if (accept.includes('application/json') && !accept.includes('text/html')) return true
  return false
}

export function priceForRequest(
  headers: HeaderBag,
  env: NodeJS.ProcessEnv = process.env
): number {
  return isCrawler(headers) ? crawlerSats(env) : humanSats(env)
}

/**
 * Chrome navigation of an empty 402 is net::ERR_HTTP_RESPONSE_CODE_FAILURE.
 * Browsers that ask for HTML get a paywall body. Crawlers / JSON Accept stay
 * machine-readable.
 */
export function prefersHtmlPaywall(headers: HeaderBag): boolean {
  if (isCrawler(headers)) return false
  const accept = headerValue(headers, 'accept').toLowerCase()
  if (accept.includes('application/json') && !accept.includes('text/html')) return false
  return accept.includes('text/html') || accept === '' || accept === '*/*'
}
