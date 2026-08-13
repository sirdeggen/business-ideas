import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { FETCH_MAX_BYTES, FETCH_MAX_REDIRECTS, FETCH_TIMEOUT_MS } from './config.js'

export interface FetchHashResult {
  url: string
  finalUrl: string
  status: number
  contentType: string | null
  sha256: string
  bytes: number
}

const BLOCKED_HOSTS = new Set(['localhost', '0.0.0.0', '::', '::1'])

export function isBlockedIPv4(address: string): boolean {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true
  }
  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a >= 224) return true
  return false
}

export function isBlockedIPv6(address: string): boolean {
  const normalized = address.toLowerCase()
  if (normalized === '::' || normalized === '::1') return true
  if (normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length)
    if (isIP(mapped) === 4) return isBlockedIPv4(mapped)
  }
  return false
}

export function isBlockedIp(address: string): boolean {
  const version = isIP(address)
  if (version === 4) return isBlockedIPv4(address)
  if (version === 6) return isBlockedIPv6(address)
  return true
}

export async function assertPublicHttpUrl(urlString: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(urlString)
  } catch {
    throw new Error('Invalid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs are allowed')
  }
  if (url.username || url.password) {
    throw new Error('URLs with credentials are not allowed')
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new Error('Private or local hosts are not allowed')
  }

  if (isIP(host)) {
    if (isBlockedIp(host)) throw new Error('Private or local hosts are not allowed')
    return url
  }

  const records = await lookup(host, { all: true, verbatim: true })
  if (records.length === 0 || records.some((record) => isBlockedIp(record.address))) {
    throw new Error('Private or local hosts are not allowed')
  }
  return url
}

export async function fetchHash(urlString: string): Promise<FetchHashResult> {
  let current = await assertPublicHttpUrl(urlString)
  let response: Response | undefined

  for (let hop = 0; hop <= FETCH_MAX_REDIRECTS; hop++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { accept: '*/*' }
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Fetch timed out after ${FETCH_TIMEOUT_MS}ms`)
      }
      throw error
    } finally {
      clearTimeout(timer)
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) break
      current = await assertPublicHttpUrl(new URL(location, current).toString())
      continue
    }
    break
  }

  if (!response) throw new Error('Fetch failed')

  const reader = response.body?.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  if (reader) {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > FETCH_MAX_BYTES) {
        await reader.cancel()
        throw new Error(`Response exceeded ${FETCH_MAX_BYTES} bytes`)
      }
      chunks.push(value)
    }
  }

  const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
  return {
    url: urlString,
    finalUrl: current.toString(),
    status: response.status,
    contentType: response.headers.get('content-type'),
    sha256: createHash('sha256').update(body).digest('hex'),
    bytes: body.byteLength
  }
}
