import { isListingId } from '../../../protocol/handoff'

const TXID = /^[0-9a-f]{64}$/i

export function isHintTxid(value: string | null | undefined): value is string {
  return typeof value === 'string' && TXID.test(value)
}

/**
 * Deep links are query params only (`?h=` / `?tx=`).
 * GitHub Pages 404s path routes like `/h/:id`.
 */
export function parseListingLocation(
  search: string,
  hash = ''
): { listingId: string | null, hintTxid: string | null } {
  let listingId: string | null = null
  let hintTxid: string | null = null

  const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const queryId = (searchParams.get('h') ?? '').trim()
  if (isListingId(queryId)) listingId = queryId.toLowerCase()
  const queryTx = (searchParams.get('tx') ?? '').trim()
  if (isHintTxid(queryTx)) hintTxid = queryTx.toLowerCase()

  const hashBody = hash.startsWith('#') ? hash.slice(1) : hash
  const hashQuery = hashBody.includes('?') ? hashBody.slice(hashBody.indexOf('?') + 1) : hashBody.replace(/^#/, '')
  const hashParams = new URLSearchParams(hashQuery)
  const hashId = (hashParams.get('h') ?? '').trim()
  if (!listingId && isListingId(hashId)) listingId = hashId.toLowerCase()
  const hashTx = (hashParams.get('tx') ?? '').trim()
  if (!hintTxid && isHintTxid(hashTx)) hintTxid = hashTx.toLowerCase()

  return { listingId, hintTxid }
}

export function listingHref(listingId: string, hintTxid?: string | null): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  const params = new URLSearchParams()
  params.set('h', listingId)
  if (isHintTxid(hintTxid)) params.set('tx', hintTxid.toLowerCase())
  return `${normalized}?${params.toString()}`
}

export function listingPublicUrl(listingId: string, hintTxid?: string | null): string {
  if (typeof window === 'undefined') return listingHref(listingId, hintTxid)
  return `${window.location.origin}${listingHref(listingId, hintTxid)}`
}

export function readListingFromLocation(): { listingId: string | null, hintTxid: string | null } {
  if (typeof window === 'undefined') return { listingId: null, hintTxid: null }
  return parseListingLocation(window.location.search, window.location.hash)
}

export function homeHref(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

export function goToListing(listingId: string, hintTxid?: string | null): void {
  window.history.replaceState({ listingId, hintTxid }, '', listingHref(listingId, hintTxid))
}

export function goHome(): void {
  window.history.replaceState({}, '', homeHref())
}
