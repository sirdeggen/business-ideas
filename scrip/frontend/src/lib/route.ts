import { isScripId } from '../../../protocol/scrip'

const TXID = /^[0-9a-f]{64}$/i

export function isHintTxid(value: string | null | undefined): value is string {
  return typeof value === 'string' && TXID.test(value)
}

/**
 * Deep links are query params only (`?s=` / `?tx=`).
 * GitHub Pages 404s path routes like `/s/:id`.
 */
export function parseScripLocation(
  search: string,
  hash = ''
): { scripId: string | null, hintTxid: string | null } {
  let scripId: string | null = null
  let hintTxid: string | null = null

  const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const queryId = (searchParams.get('s') ?? '').trim()
  if (isScripId(queryId)) scripId = queryId.toLowerCase()
  const queryTx = (searchParams.get('tx') ?? '').trim()
  if (isHintTxid(queryTx)) hintTxid = queryTx.toLowerCase()

  const hashBody = hash.startsWith('#') ? hash.slice(1) : hash
  const hashQuery = hashBody.includes('?') ? hashBody.slice(hashBody.indexOf('?') + 1) : hashBody.replace(/^#/, '')
  const hashParams = new URLSearchParams(hashQuery)
  const hashId = (hashParams.get('s') ?? '').trim()
  if (!scripId && isScripId(hashId)) scripId = hashId.toLowerCase()
  const hashTx = (hashParams.get('tx') ?? '').trim()
  if (!hintTxid && isHintTxid(hashTx)) hintTxid = hashTx.toLowerCase()

  return { scripId, hintTxid }
}

export function scripHref(scripId: string, hintTxid?: string | null): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  const params = new URLSearchParams()
  params.set('s', scripId)
  if (isHintTxid(hintTxid)) params.set('tx', hintTxid.toLowerCase())
  return `${normalized}?${params.toString()}`
}

export function scripPublicUrl(scripId: string, hintTxid?: string | null): string {
  if (typeof window === 'undefined') return scripHref(scripId, hintTxid)
  return `${window.location.origin}${scripHref(scripId, hintTxid)}`
}

export function readScripFromLocation(): { scripId: string | null, hintTxid: string | null } {
  if (typeof window === 'undefined') return { scripId: null, hintTxid: null }
  return parseScripLocation(window.location.search, window.location.hash)
}

export function homeHref(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

export function goToScrip(scripId: string, hintTxid?: string | null): void {
  window.history.replaceState({ scripId, hintTxid }, '', scripHref(scripId, hintTxid))
}

export function goHome(): void {
  window.history.replaceState({}, '', homeHref())
}
