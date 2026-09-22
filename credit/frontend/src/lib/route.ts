import { isFacilityId } from '../../../protocol/credit'

const TXID = /^[0-9a-f]{64}$/i

export function isHintTxid(value: string | null | undefined): value is string {
  return typeof value === 'string' && TXID.test(value)
}

/**
 * Deep links are query params only (`?c=` / `?tx=`).
 * GitHub Pages 404s path routes like `/c/:id`.
 */
export function parseFacilityLocation(
  search: string,
  hash = ''
): { facilityId: string | null, hintTxid: string | null } {
  let facilityId: string | null = null
  let hintTxid: string | null = null

  const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const queryId = (searchParams.get('c') ?? '').trim()
  if (isFacilityId(queryId)) facilityId = queryId.toLowerCase()
  const queryTx = (searchParams.get('tx') ?? '').trim()
  if (isHintTxid(queryTx)) hintTxid = queryTx.toLowerCase()

  const hashBody = hash.startsWith('#') ? hash.slice(1) : hash
  const hashQuery = hashBody.includes('?') ? hashBody.slice(hashBody.indexOf('?') + 1) : hashBody.replace(/^#/, '')
  const hashParams = new URLSearchParams(hashQuery)
  const hashId = (hashParams.get('c') ?? '').trim()
  if (!facilityId && isFacilityId(hashId)) facilityId = hashId.toLowerCase()
  const hashTx = (hashParams.get('tx') ?? '').trim()
  if (!hintTxid && isHintTxid(hashTx)) hintTxid = hashTx.toLowerCase()

  return { facilityId, hintTxid }
}

export function facilityHref(facilityId: string, hintTxid?: string | null): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  const params = new URLSearchParams()
  params.set('c', facilityId)
  if (isHintTxid(hintTxid)) params.set('tx', hintTxid.toLowerCase())
  return `${normalized}?${params.toString()}`
}

export function facilityPublicUrl(facilityId: string, hintTxid?: string | null): string {
  if (typeof window === 'undefined') return facilityHref(facilityId, hintTxid)
  return `${window.location.origin}${facilityHref(facilityId, hintTxid)}`
}

export function readFacilityFromLocation(): { facilityId: string | null, hintTxid: string | null } {
  if (typeof window === 'undefined') return { facilityId: null, hintTxid: null }
  return parseFacilityLocation(window.location.search, window.location.hash)
}

export function homeHref(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

export function goToFacility(facilityId: string, hintTxid?: string | null): void {
  window.history.replaceState({ facilityId, hintTxid }, '', facilityHref(facilityId, hintTxid))
}

export function goHome(): void {
  window.history.replaceState({}, '', homeHref())
}
