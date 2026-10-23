import { isIdentityKey, isRoundId } from '../../../protocol/round'

const TXID = /^[0-9a-f]{64}$/i

export function isHintTxid(value: string | null | undefined): value is string {
  return typeof value === 'string' && TXID.test(value)
}

export interface RoundLocation {
  roundId: string | null
  hintTxid: string | null
  pinIdentity: string | null
}

/**
 * Deep links are query params only (`?r=` / `?tx=` / `?p=`).
 * GitHub Pages 404s path routes like `/r/:id`.
 * `?p=` pins an issuer identity key. Raises from other keys are ignored.
 */
export function parseRoundLocation(search: string, hash = ''): RoundLocation {
  let roundId: string | null = null
  let hintTxid: string | null = null
  let pinIdentity: string | null = null

  const take = (params: URLSearchParams): void => {
    const queryId = (params.get('r') ?? '').trim()
    if (!roundId && isRoundId(queryId)) roundId = queryId.toLowerCase()
    const queryTx = (params.get('tx') ?? '').trim()
    if (!hintTxid && isHintTxid(queryTx)) hintTxid = queryTx.toLowerCase()
    const queryPin = (params.get('p') ?? '').trim()
    if (!pinIdentity && isIdentityKey(queryPin)) pinIdentity = queryPin.toLowerCase()
  }

  take(new URLSearchParams(search.startsWith('?') ? search.slice(1) : search))
  const hashBody = hash.startsWith('#') ? hash.slice(1) : hash
  const hashQuery = hashBody.includes('?') ? hashBody.slice(hashBody.indexOf('?') + 1) : hashBody.replace(/^#/, '')
  take(new URLSearchParams(hashQuery))

  return { roundId, hintTxid, pinIdentity }
}

export function roundHref(roundId: string, hintTxid?: string | null, pinIdentity?: string | null): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  const params = new URLSearchParams()
  params.set('r', roundId)
  if (isHintTxid(hintTxid)) params.set('tx', hintTxid.toLowerCase())
  if (pinIdentity && isIdentityKey(pinIdentity)) params.set('p', pinIdentity.toLowerCase())
  return `${normalized}?${params.toString()}`
}

export function roundPublicUrl(roundId: string, hintTxid?: string | null, pinIdentity?: string | null): string {
  if (typeof window === 'undefined') return roundHref(roundId, hintTxid, pinIdentity)
  return `${window.location.origin}${roundHref(roundId, hintTxid, pinIdentity)}`
}

export function readRoundFromLocation(): RoundLocation {
  if (typeof window === 'undefined') return { roundId: null, hintTxid: null, pinIdentity: null }
  return parseRoundLocation(window.location.search, window.location.hash)
}

export function homeHref(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

export function goToRound(roundId: string, hintTxid?: string | null, pinIdentity?: string | null): void {
  window.history.replaceState({ roundId, hintTxid, pinIdentity }, '', roundHref(roundId, hintTxid, pinIdentity))
}

export function goHome(): void {
  window.history.replaceState({}, '', homeHref())
}
