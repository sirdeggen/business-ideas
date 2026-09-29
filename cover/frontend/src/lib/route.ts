import { isPolicyId } from '../../../protocol/cover'

const TXID = /^[0-9a-f]{64}$/i

export function isHintTxid(value: string | null | undefined): value is string {
  return typeof value === 'string' && TXID.test(value)
}

/**
 * Deep links are query params only (`?p=` / `?tx=`).
 * GitHub Pages 404s path routes like `/p/:id`.
 */
export function parsePolicyLocation(
  search: string,
  hash = ''
): { policyId: string | null, hintTxid: string | null } {
  let policyId: string | null = null
  let hintTxid: string | null = null

  const read = (raw: string): void => {
    const searchParams = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw)
    const queryId = (searchParams.get('p') ?? '').trim()
    if (!policyId && isPolicyId(queryId)) policyId = queryId.toLowerCase()
    const queryTx = (searchParams.get('tx') ?? '').trim()
    if (!hintTxid && isHintTxid(queryTx)) hintTxid = queryTx.toLowerCase()
  }

  read(search.startsWith('?') ? search.slice(1) : search)
  const hashBody = hash.startsWith('#') ? hash.slice(1) : hash
  const hashQuery = hashBody.includes('?') ? hashBody.slice(hashBody.indexOf('?') + 1) : ''
  if (hashQuery) read(hashQuery)

  return { policyId, hintTxid }
}

export function parsePolicyLink(raw: string): { policyId: string | null, hintTxid: string | null } {
  const trimmed = raw.trim()
  if (!trimmed) return { policyId: null, hintTxid: null }
  if (isPolicyId(trimmed)) return { policyId: trimmed.toLowerCase(), hintTxid: null }
  const queryIndex = trimmed.indexOf('?')
  const hashIndex = trimmed.indexOf('#')
  const search = queryIndex >= 0 ? trimmed.slice(queryIndex) : ''
  const hash = hashIndex >= 0 ? trimmed.slice(hashIndex) : ''
  return parsePolicyLocation(search, hash)
}

export function policyHref(policyId: string, hintTxid?: string | null): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  const params = new URLSearchParams()
  params.set('p', policyId)
  if (isHintTxid(hintTxid)) params.set('tx', hintTxid.toLowerCase())
  return `${normalized}?${params.toString()}`
}

export function policyPublicUrl(policyId: string, hintTxid?: string | null): string {
  if (typeof window === 'undefined') return policyHref(policyId, hintTxid)
  return `${window.location.origin}${policyHref(policyId, hintTxid)}`
}

export function readPolicyFromLocation(): { policyId: string | null, hintTxid: string | null } {
  if (typeof window === 'undefined') return { policyId: null, hintTxid: null }
  return parsePolicyLocation(window.location.search, window.location.hash)
}

export function goToPolicy(policyId: string, hintTxid?: string | null): void {
  window.history.replaceState({ policyId, hintTxid }, '', policyHref(policyId, hintTxid))
}

export function goHome(): void {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  window.history.replaceState({}, '', normalized)
}
