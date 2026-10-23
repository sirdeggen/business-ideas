import { isMandateId } from '../../../protocol/mandate'

const TXID = /^[0-9a-f]{64}$/i

export function isHintTxid(value: string | null | undefined): value is string {
  return typeof value === 'string' && TXID.test(value)
}

/**
 * Deep links are query params only (`?m=` / `?tx=`).
 * GitHub Pages 404s path routes like `/m/:id`.
 */
export function parseMandateLocation(
  search: string,
  hash = ''
): { mandateId: string | null, hintTxid: string | null } {
  let mandateId: string | null = null
  let hintTxid: string | null = null

  const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const queryId = (searchParams.get('m') ?? '').trim()
  if (isMandateId(queryId)) mandateId = queryId.toLowerCase()
  const queryTx = (searchParams.get('tx') ?? '').trim()
  if (isHintTxid(queryTx)) hintTxid = queryTx.toLowerCase()

  const hashBody = hash.startsWith('#') ? hash.slice(1) : hash
  const hashQuery = hashBody.includes('?') ? hashBody.slice(hashBody.indexOf('?') + 1) : hashBody.replace(/^#/, '')
  const hashParams = new URLSearchParams(hashQuery)
  const hashId = (hashParams.get('m') ?? '').trim()
  if (!mandateId && isMandateId(hashId)) mandateId = hashId.toLowerCase()
  const hashTx = (hashParams.get('tx') ?? '').trim()
  if (!hintTxid && isHintTxid(hashTx)) hintTxid = hashTx.toLowerCase()

  return { mandateId, hintTxid }
}

export function mandateHref(mandateId: string, hintTxid?: string | null): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  const params = new URLSearchParams()
  params.set('m', mandateId)
  if (isHintTxid(hintTxid)) params.set('tx', hintTxid.toLowerCase())
  return `${normalized}?${params.toString()}`
}

export function mandatePublicUrl(mandateId: string, hintTxid?: string | null): string {
  if (typeof window === 'undefined') return mandateHref(mandateId, hintTxid)
  return `${window.location.origin}${mandateHref(mandateId, hintTxid)}`
}

export function readMandateFromLocation(): { mandateId: string | null, hintTxid: string | null } {
  if (typeof window === 'undefined') return { mandateId: null, hintTxid: null }
  return parseMandateLocation(window.location.search, window.location.hash)
}

export function homeHref(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

export function goToMandate(mandateId: string, hintTxid?: string | null): void {
  window.history.replaceState({ mandateId, hintTxid }, '', mandateHref(mandateId, hintTxid))
}

export function goHome(): void {
  window.history.replaceState({}, '', homeHref())
}
