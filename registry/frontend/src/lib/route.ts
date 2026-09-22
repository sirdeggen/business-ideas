import { isRegisterId } from '../../../protocol/registry'

const TXID = /^[0-9a-f]{64}$/i

export function isHintTxid(value: string | null | undefined): value is string {
  return typeof value === 'string' && TXID.test(value)
}

/**
 * Deep links are query params only (`?r=` / `?tx=`).
 * GitHub Pages 404s path routes like `/r/:id`.
 */
export function parseRegisterLocation(
  search: string,
  hash = ''
): { registerId: string | null, hintTxid: string | null } {
  let registerId: string | null = null
  let hintTxid: string | null = null

  const read = (raw: string): void => {
    const searchParams = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw)
    const queryId = (searchParams.get('r') ?? '').trim()
    if (!registerId && isRegisterId(queryId)) registerId = queryId.toLowerCase()
    const queryTx = (searchParams.get('tx') ?? '').trim()
    if (!hintTxid && isHintTxid(queryTx)) hintTxid = queryTx.toLowerCase()
  }

  read(search.startsWith('?') ? search.slice(1) : search)
  const hashBody = hash.startsWith('#') ? hash.slice(1) : hash
  const hashQuery = hashBody.includes('?') ? hashBody.slice(hashBody.indexOf('?') + 1) : ''
  if (hashQuery) read(hashQuery)

  return { registerId, hintTxid }
}

export function parseRegisterLink(raw: string): { registerId: string | null, hintTxid: string | null } {
  const trimmed = raw.trim()
  if (!trimmed) return { registerId: null, hintTxid: null }
  if (isRegisterId(trimmed)) return { registerId: trimmed.toLowerCase(), hintTxid: null }
  const queryIndex = trimmed.indexOf('?')
  const hashIndex = trimmed.indexOf('#')
  const search = queryIndex >= 0 ? trimmed.slice(queryIndex) : ''
  const hash = hashIndex >= 0 ? trimmed.slice(hashIndex) : ''
  return parseRegisterLocation(search, hash)
}

export function registerHref(registerId: string, hintTxid?: string | null): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  const params = new URLSearchParams()
  params.set('r', registerId)
  if (isHintTxid(hintTxid)) params.set('tx', hintTxid.toLowerCase())
  return `${normalized}?${params.toString()}`
}

export function registerPublicUrl(registerId: string, hintTxid?: string | null): string {
  if (typeof window === 'undefined') return registerHref(registerId, hintTxid)
  return `${window.location.origin}${registerHref(registerId, hintTxid)}`
}

export function readRegisterFromLocation(): { registerId: string | null, hintTxid: string | null } {
  if (typeof window === 'undefined') return { registerId: null, hintTxid: null }
  return parseRegisterLocation(window.location.search, window.location.hash)
}

export function goToRegister(registerId: string, hintTxid?: string | null): void {
  window.history.replaceState({ registerId, hintTxid }, '', registerHref(registerId, hintTxid))
}
