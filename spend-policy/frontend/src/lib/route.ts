import { isPolicyId } from '../../../protocol/spendpolicy'

const TXID = /^[0-9a-f]{64}$/i

export function isCreateTxid(value: string | null | undefined): value is string {
  return typeof value === 'string' && TXID.test(value)
}

/**
 * Deep links are query params only (`?p=` / `?tx=`).
 * GitHub Pages 404s path routes like `/p/:id`.
 */
export function parsePolicyLocation(
  search: string,
  hash = ''
): { policyId: string | null, createTxid: string | null } {
  let policyId: string | null = null
  let createTxid: string | null = null

  const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const queryId = (searchParams.get('p') ?? '').trim()
  if (isPolicyId(queryId)) policyId = queryId.toLowerCase()
  const queryTx = (searchParams.get('tx') ?? '').trim()
  if (isCreateTxid(queryTx)) createTxid = queryTx.toLowerCase()

  const hashBody = hash.startsWith('#') ? hash.slice(1) : hash
  const hashQuery = hashBody.includes('?') ? hashBody.slice(hashBody.indexOf('?') + 1) : hashBody.replace(/^#/, '')
  const hashParams = new URLSearchParams(hashQuery)
  const hashId = (hashParams.get('p') ?? '').trim()
  if (!policyId && isPolicyId(hashId)) policyId = hashId.toLowerCase()
  const hashTx = (hashParams.get('tx') ?? '').trim()
  if (!createTxid && isCreateTxid(hashTx)) createTxid = hashTx.toLowerCase()

  return { policyId, createTxid }
}

export function policyHref(policyId: string, createTxid?: string | null): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  const params = new URLSearchParams()
  params.set('p', policyId)
  if (isCreateTxid(createTxid)) params.set('tx', createTxid.toLowerCase())
  return `${normalized}?${params.toString()}`
}

export function policyPublicUrl(policyId: string, createTxid?: string | null): string {
  if (typeof window === 'undefined') return policyHref(policyId, createTxid)
  return `${window.location.origin}${policyHref(policyId, createTxid)}`
}

export function readPolicyFromLocation(): { policyId: string | null, createTxid: string | null } {
  if (typeof window === 'undefined') return { policyId: null, createTxid: null }
  return parsePolicyLocation(window.location.search, window.location.hash)
}

export function homeHref(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

export function goToPolicy(policyId: string, createTxid?: string | null): void {
  window.history.replaceState({ policyId, createTxid }, '', policyHref(policyId, createTxid))
}

export function goHome(): void {
  window.history.replaceState({}, '', homeHref())
}
