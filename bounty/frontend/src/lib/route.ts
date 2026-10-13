import { isBountyId, isIdentityKey } from '../../../protocol/bounty'

const TXID = /^[0-9a-f]{64}$/i

export function isHintTxid(value: string | null | undefined): value is string {
  return typeof value === 'string' && TXID.test(value)
}

export interface BountyLocation {
  bountyId: string | null
  hintTxid: string | null
  pinIdentity: string | null
}

/**
 * Deep links are query params only (`?b=` / `?tx=` / `?p=`).
 * GitHub Pages 404s path routes like `/b/:id`.
 * `?p=` pins a project identity key. Funds from other keys are ignored.
 */
export function parseBountyLocation(search: string, hash = ''): BountyLocation {
  let bountyId: string | null = null
  let hintTxid: string | null = null
  let pinIdentity: string | null = null

  const take = (params: URLSearchParams): void => {
    const queryId = (params.get('b') ?? '').trim()
    if (!bountyId && isBountyId(queryId)) bountyId = queryId.toLowerCase()
    const queryTx = (params.get('tx') ?? '').trim()
    if (!hintTxid && isHintTxid(queryTx)) hintTxid = queryTx.toLowerCase()
    const queryPin = (params.get('p') ?? '').trim()
    if (!pinIdentity && isIdentityKey(queryPin)) pinIdentity = queryPin.toLowerCase()
  }

  take(new URLSearchParams(search.startsWith('?') ? search.slice(1) : search))
  const hashBody = hash.startsWith('#') ? hash.slice(1) : hash
  const hashQuery = hashBody.includes('?') ? hashBody.slice(hashBody.indexOf('?') + 1) : hashBody.replace(/^#/, '')
  take(new URLSearchParams(hashQuery))

  return { bountyId, hintTxid, pinIdentity }
}

export function bountyHref(bountyId: string, hintTxid?: string | null, pinIdentity?: string | null): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  const params = new URLSearchParams()
  params.set('b', bountyId)
  if (isHintTxid(hintTxid)) params.set('tx', hintTxid.toLowerCase())
  if (pinIdentity && isIdentityKey(pinIdentity)) params.set('p', pinIdentity.toLowerCase())
  return `${normalized}?${params.toString()}`
}

export function bountyPublicUrl(bountyId: string, hintTxid?: string | null, pinIdentity?: string | null): string {
  if (typeof window === 'undefined') return bountyHref(bountyId, hintTxid, pinIdentity)
  return `${window.location.origin}${bountyHref(bountyId, hintTxid, pinIdentity)}`
}

export function readBountyFromLocation(): BountyLocation {
  if (typeof window === 'undefined') return { bountyId: null, hintTxid: null, pinIdentity: null }
  return parseBountyLocation(window.location.search, window.location.hash)
}

export function homeHref(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

export function goToBounty(bountyId: string, hintTxid?: string | null, pinIdentity?: string | null): void {
  window.history.replaceState({ bountyId, hintTxid, pinIdentity }, '', bountyHref(bountyId, hintTxid, pinIdentity))
}

export function goHome(): void {
  window.history.replaceState({}, '', homeHref())
}
