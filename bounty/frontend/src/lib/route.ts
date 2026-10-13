import { isBountyId } from '../../../protocol/bounty'

const TXID = /^[0-9a-f]{64}$/i

export function isHintTxid(value: string | null | undefined): value is string {
  return typeof value === 'string' && TXID.test(value)
}

/**
 * Deep links are query params only (`?b=` / `?tx=`).
 * GitHub Pages 404s path routes like `/b/:id`.
 */
export function parseBountyLocation(
  search: string,
  hash = ''
): { bountyId: string | null, hintTxid: string | null } {
  let bountyId: string | null = null
  let hintTxid: string | null = null

  const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const queryId = (searchParams.get('b') ?? '').trim()
  if (isBountyId(queryId)) bountyId = queryId.toLowerCase()
  const queryTx = (searchParams.get('tx') ?? '').trim()
  if (isHintTxid(queryTx)) hintTxid = queryTx.toLowerCase()

  const hashBody = hash.startsWith('#') ? hash.slice(1) : hash
  const hashQuery = hashBody.includes('?') ? hashBody.slice(hashBody.indexOf('?') + 1) : hashBody.replace(/^#/, '')
  const hashParams = new URLSearchParams(hashQuery)
  const hashId = (hashParams.get('b') ?? '').trim()
  if (!bountyId && isBountyId(hashId)) bountyId = hashId.toLowerCase()
  const hashTx = (hashParams.get('tx') ?? '').trim()
  if (!hintTxid && isHintTxid(hashTx)) hintTxid = hashTx.toLowerCase()

  return { bountyId, hintTxid }
}

export function bountyHref(bountyId: string, hintTxid?: string | null): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  const params = new URLSearchParams()
  params.set('b', bountyId)
  if (isHintTxid(hintTxid)) params.set('tx', hintTxid.toLowerCase())
  return `${normalized}?${params.toString()}`
}

export function bountyPublicUrl(bountyId: string, hintTxid?: string | null): string {
  if (typeof window === 'undefined') return bountyHref(bountyId, hintTxid)
  return `${window.location.origin}${bountyHref(bountyId, hintTxid)}`
}

export function readBountyFromLocation(): { bountyId: string | null, hintTxid: string | null } {
  if (typeof window === 'undefined') return { bountyId: null, hintTxid: null }
  return parseBountyLocation(window.location.search, window.location.hash)
}

export function homeHref(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

export function goToBounty(bountyId: string, hintTxid?: string | null): void {
  window.history.replaceState({ bountyId, hintTxid }, '', bountyHref(bountyId, hintTxid))
}

export function goHome(): void {
  window.history.replaceState({}, '', homeHref())
}
