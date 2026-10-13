import { isKeepsakeId } from '../../../protocol/keepsake'

const TXID = /^[0-9a-f]{64}$/i

export function isHintTxid(value: string | null | undefined): value is string {
  return typeof value === 'string' && TXID.test(value)
}

/**
 * Deep links are query params only (`?k=` / `?tx=`).
 * GitHub Pages 404s path routes like `/k/:id`.
 */
export function parseKeepsakeLocation(
  search: string,
  hash = ''
): { keepsakeId: string | null, hintTxid: string | null } {
  let keepsakeId: string | null = null
  let hintTxid: string | null = null

  const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const queryId = (searchParams.get('k') ?? '').trim()
  if (isKeepsakeId(queryId)) keepsakeId = queryId.toLowerCase()
  const queryTx = (searchParams.get('tx') ?? '').trim()
  if (isHintTxid(queryTx)) hintTxid = queryTx.toLowerCase()

  const hashBody = hash.startsWith('#') ? hash.slice(1) : hash
  const hashQuery = hashBody.includes('?') ? hashBody.slice(hashBody.indexOf('?') + 1) : hashBody.replace(/^#/, '')
  const hashParams = new URLSearchParams(hashQuery)
  const hashId = (hashParams.get('k') ?? '').trim()
  if (!keepsakeId && isKeepsakeId(hashId)) keepsakeId = hashId.toLowerCase()
  const hashTx = (hashParams.get('tx') ?? '').trim()
  if (!hintTxid && isHintTxid(hashTx)) hintTxid = hashTx.toLowerCase()

  return { keepsakeId, hintTxid }
}

export function keepsakeHref(keepsakeId: string, hintTxid?: string | null): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  const params = new URLSearchParams()
  params.set('k', keepsakeId)
  if (isHintTxid(hintTxid)) params.set('tx', hintTxid.toLowerCase())
  return `${normalized}?${params.toString()}`
}

export function keepsakePublicUrl(keepsakeId: string, hintTxid?: string | null): string {
  if (typeof window === 'undefined') return keepsakeHref(keepsakeId, hintTxid)
  return `${window.location.origin}${keepsakeHref(keepsakeId, hintTxid)}`
}

export function readKeepsakeFromLocation(): { keepsakeId: string | null, hintTxid: string | null } {
  if (typeof window === 'undefined') return { keepsakeId: null, hintTxid: null }
  return parseKeepsakeLocation(window.location.search, window.location.hash)
}

export function homeHref(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

export function goToKeepsake(keepsakeId: string, hintTxid?: string | null): void {
  window.history.replaceState({ keepsakeId, hintTxid }, '', keepsakeHref(keepsakeId, hintTxid))
}

export function goHome(): void {
  window.history.replaceState({}, '', homeHref())
}
