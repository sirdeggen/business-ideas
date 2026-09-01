import { isMembershipId } from '../../../protocol/membership'

const TXID = /^[0-9a-f]{64}$/i

export function isCreateTxid(value: string | null | undefined): value is string {
  return typeof value === 'string' && TXID.test(value)
}

/**
 * Deep links are query params only (`?m=` / `?tx=`).
 * GitHub Pages 404s path routes like `/m/:id`.
 */
export function parseMembershipLocation(
  search: string,
  hash = ''
): { membershipId: string | null, createTxid: string | null } {
  let membershipId: string | null = null
  let createTxid: string | null = null

  const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const queryId = (searchParams.get('m') ?? '').trim()
  if (isMembershipId(queryId)) membershipId = queryId.toLowerCase()
  const queryTx = (searchParams.get('tx') ?? '').trim()
  if (isCreateTxid(queryTx)) createTxid = queryTx.toLowerCase()

  const hashBody = hash.startsWith('#') ? hash.slice(1) : hash
  const hashQuery = hashBody.includes('?') ? hashBody.slice(hashBody.indexOf('?') + 1) : hashBody.replace(/^#/, '')
  const hashParams = new URLSearchParams(hashQuery)
  const hashId = (hashParams.get('m') ?? '').trim()
  if (!membershipId && isMembershipId(hashId)) membershipId = hashId.toLowerCase()
  const hashTx = (hashParams.get('tx') ?? '').trim()
  if (!createTxid && isCreateTxid(hashTx)) createTxid = hashTx.toLowerCase()

  return { membershipId, createTxid }
}

export function membershipHref(membershipId: string, createTxid?: string | null): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  const params = new URLSearchParams()
  params.set('m', membershipId)
  if (isCreateTxid(createTxid)) params.set('tx', createTxid.toLowerCase())
  return `${normalized}?${params.toString()}`
}

export function membershipPublicUrl(membershipId: string, createTxid?: string | null): string {
  if (typeof window === 'undefined') return membershipHref(membershipId, createTxid)
  return `${window.location.origin}${membershipHref(membershipId, createTxid)}`
}

export function readMembershipFromLocation(): { membershipId: string | null, createTxid: string | null } {
  if (typeof window === 'undefined') return { membershipId: null, createTxid: null }
  return parseMembershipLocation(window.location.search, window.location.hash)
}

export function homeHref(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

export function goToMembership(membershipId: string, createTxid?: string | null): void {
  window.history.replaceState({ membershipId, createTxid }, '', membershipHref(membershipId, createTxid))
}

export function goHome(): void {
  window.history.replaceState({}, '', homeHref())
}
