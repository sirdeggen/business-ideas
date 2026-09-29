import { isOfferId } from '../../../protocol/inference'

const TXID = /^[0-9a-f]{64}$/i

export function isHintTxid(value: string | null | undefined): value is string {
  return typeof value === 'string' && TXID.test(value)
}

/**
 * Deep links are query params only (`?o=` / `?tx=`).
 * GitHub Pages 404s path routes like `/o/:id`.
 */
export function parseOfferLocation(
  search: string,
  hash = ''
): { offerId: string | null, hintTxid: string | null } {
  let offerId: string | null = null
  let hintTxid: string | null = null

  const read = (raw: string): void => {
    const searchParams = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw)
    const queryId = (searchParams.get('o') ?? '').trim()
    if (!offerId && isOfferId(queryId)) offerId = queryId.toLowerCase()
    const queryTx = (searchParams.get('tx') ?? '').trim()
    if (!hintTxid && isHintTxid(queryTx)) hintTxid = queryTx.toLowerCase()
  }

  read(search.startsWith('?') ? search.slice(1) : search)
  const hashBody = hash.startsWith('#') ? hash.slice(1) : hash
  const hashQuery = hashBody.includes('?') ? hashBody.slice(hashBody.indexOf('?') + 1) : ''
  if (hashQuery) read(hashQuery)

  return { offerId, hintTxid }
}

export function offerHref(offerId: string, hintTxid?: string | null): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  const params = new URLSearchParams()
  params.set('o', offerId)
  if (isHintTxid(hintTxid)) params.set('tx', hintTxid.toLowerCase())
  return `${normalized}?${params.toString()}`
}

export function offerPublicUrl(offerId: string, hintTxid?: string | null): string {
  if (typeof window === 'undefined') return offerHref(offerId, hintTxid)
  return `${window.location.origin}${offerHref(offerId, hintTxid)}`
}

export function readOfferFromLocation(): { offerId: string | null, hintTxid: string | null } {
  if (typeof window === 'undefined') return { offerId: null, hintTxid: null }
  return parseOfferLocation(window.location.search, window.location.hash)
}

export function goToOffer(offerId: string, hintTxid?: string | null): void {
  window.history.replaceState({ offerId, hintTxid }, '', offerHref(offerId, hintTxid))
}
