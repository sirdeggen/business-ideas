import { isClosingId } from '../../../protocol/closing'

const TXID = /^[0-9a-f]{64}$/i

export function isHintTxid(value: string | null | undefined): value is string {
  return typeof value === 'string' && TXID.test(value)
}

/**
 * Deep links are query params only (`?c=` / `?tx=`).
 * GitHub Pages 404s path routes like `/c/:id`.
 */
export function parseClosingLocation(
  search: string,
  hash = ''
): { closingId: string | null, hintTxid: string | null } {
  let closingId: string | null = null
  let hintTxid: string | null = null

  const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const queryId = (searchParams.get('c') ?? '').trim()
  if (isClosingId(queryId)) closingId = queryId.toLowerCase()
  const queryTx = (searchParams.get('tx') ?? '').trim()
  if (isHintTxid(queryTx)) hintTxid = queryTx.toLowerCase()

  const hashBody = hash.startsWith('#') ? hash.slice(1) : hash
  const hashQuery = hashBody.includes('?') ? hashBody.slice(hashBody.indexOf('?') + 1) : hashBody.replace(/^#/, '')
  const hashParams = new URLSearchParams(hashQuery)
  const hashId = (hashParams.get('c') ?? '').trim()
  if (!closingId && isClosingId(hashId)) closingId = hashId.toLowerCase()
  const hashTx = (hashParams.get('tx') ?? '').trim()
  if (!hintTxid && isHintTxid(hashTx)) hintTxid = hashTx.toLowerCase()

  return { closingId, hintTxid }
}

export function closingHref(closingId: string, hintTxid?: string | null): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  const params = new URLSearchParams()
  params.set('c', closingId)
  if (isHintTxid(hintTxid)) params.set('tx', hintTxid.toLowerCase())
  return `${normalized}?${params.toString()}`
}

export function closingPublicUrl(closingId: string, hintTxid?: string | null): string {
  if (typeof window === 'undefined') return closingHref(closingId, hintTxid)
  return `${window.location.origin}${closingHref(closingId, hintTxid)}`
}

export function readClosingFromLocation(): { closingId: string | null, hintTxid: string | null } {
  if (typeof window === 'undefined') return { closingId: null, hintTxid: null }
  return parseClosingLocation(window.location.search, window.location.hash)
}

export function homeHref(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

export function goToClosing(closingId: string, hintTxid?: string | null): void {
  window.history.replaceState({ closingId, hintTxid }, '', closingHref(closingId, hintTxid))
}

export function goHome(): void {
  window.history.replaceState({}, '', homeHref())
}
