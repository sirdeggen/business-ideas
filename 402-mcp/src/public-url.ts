import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

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
