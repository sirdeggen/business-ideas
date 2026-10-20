import { isIdentityKey, isRequestId } from '../../../protocol/capture'

const TXID = /^[0-9a-f]{64}$/i

export function isHintTxid(value: string | null | undefined): value is string {
  return typeof value === 'string' && TXID.test(value)
}

export interface CaptureLocation {
  requestId: string | null
  hintTxid: string | null
  pinIdentity: string | null
}

/**
 * Deep links are query params only (`?r=` / `?p=` / `?tx=`).
 * GitHub Pages 404s path routes like `/r/:id`.
 * `?p=` pins a requester identity key. Requests from other keys are ignored.
 */
export function parseCaptureLocation(search: string, hash = ''): CaptureLocation {
  let requestId: string | null = null
  let hintTxid: string | null = null
  let pinIdentity: string | null = null

  const take = (params: URLSearchParams): void => {
    const queryId = (params.get('r') ?? '').trim()
    if (!requestId && isRequestId(queryId)) requestId = queryId.toLowerCase()
    const queryTx = (params.get('tx') ?? '').trim()
    if (!hintTxid && isHintTxid(queryTx)) hintTxid = queryTx.toLowerCase()
    const queryPin = (params.get('p') ?? '').trim()
    if (!pinIdentity && isIdentityKey(queryPin)) pinIdentity = queryPin.toLowerCase()
  }

  take(new URLSearchParams(search.startsWith('?') ? search.slice(1) : search))
  const hashBody = hash.startsWith('#') ? hash.slice(1) : hash
  const hashQuery = hashBody.includes('?') ? hashBody.slice(hashBody.indexOf('?') + 1) : hashBody.replace(/^#/, '')
  take(new URLSearchParams(hashQuery))

  return { requestId, hintTxid, pinIdentity }
}

export function captureHref(requestId: string, requester: string, txid: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  const params = new URLSearchParams()
  params.set('r', requestId)
  params.set('p', requester)
  params.set('tx', txid)
  return `${normalized}?${params.toString()}`
}

export function capturePublicUrl(requestId: string, requester: string, txid: string): string {
  if (typeof window === 'undefined') return captureHref(requestId, requester, txid)
  return `${window.location.origin}${captureHref(requestId, requester, txid)}`
}

export function readCaptureFromLocation(): CaptureLocation {
  if (typeof window === 'undefined') return { requestId: null, hintTxid: null, pinIdentity: null }
  return parseCaptureLocation(window.location.search, window.location.hash)
}

export function homeHref(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

export function goToCapture(requestId: string, requester: string, txid: string): void {
  window.history.replaceState({ requestId, requester, txid }, '', captureHref(requestId, requester, txid))
}

export function goHome(): void {
  window.history.replaceState({}, '', homeHref())
}
