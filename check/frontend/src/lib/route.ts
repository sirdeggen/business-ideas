import { isCheckId } from '../../../protocol/check'

const TXID = /^[0-9a-f]{64}$/i

export function isHintTxid(value: string | null | undefined): value is string {
  return typeof value === 'string' && TXID.test(value)
}

/**
 * Deep links are query params only (`?c=` / `?tx=`).
 * GitHub Pages 404s path routes like `/c/:id`.
 */
export function parseCheckLocation(
  search: string,
  hash = ''
): { checkId: string | null, hintTxid: string | null } {
  let checkId: string | null = null
  let hintTxid: string | null = null

  const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const queryId = (searchParams.get('c') ?? '').trim()
  if (isCheckId(queryId)) checkId = queryId.toLowerCase()
  const queryTx = (searchParams.get('tx') ?? '').trim()
  if (isHintTxid(queryTx)) hintTxid = queryTx.toLowerCase()

  const hashBody = hash.startsWith('#') ? hash.slice(1) : hash
  const hashQuery = hashBody.includes('?') ? hashBody.slice(hashBody.indexOf('?') + 1) : hashBody.replace(/^#/, '')
  const hashParams = new URLSearchParams(hashQuery)
  const hashId = (hashParams.get('c') ?? '').trim()
  if (!checkId && isCheckId(hashId)) checkId = hashId.toLowerCase()
  const hashTx = (hashParams.get('tx') ?? '').trim()
  if (!hintTxid && isHintTxid(hashTx)) hintTxid = hashTx.toLowerCase()

  return { checkId, hintTxid }
}

export function checkHref(checkId: string, hintTxid?: string | null): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  const params = new URLSearchParams()
  params.set('c', checkId)
  if (isHintTxid(hintTxid)) params.set('tx', hintTxid.toLowerCase())
  return `${normalized}?${params.toString()}`
}

export function checkPublicUrl(checkId: string, hintTxid?: string | null): string {
  if (typeof window === 'undefined') return checkHref(checkId, hintTxid)
  return `${window.location.origin}${checkHref(checkId, hintTxid)}`
}

export function readCheckFromLocation(): { checkId: string | null, hintTxid: string | null } {
  if (typeof window === 'undefined') return { checkId: null, hintTxid: null }
  return parseCheckLocation(window.location.search, window.location.hash)
}

export function homeHref(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

export function goToCheck(checkId: string, hintTxid?: string | null): void {
  window.history.replaceState({ checkId, hintTxid }, '', checkHref(checkId, hintTxid))
}

export function goHome(): void {
  window.history.replaceState({}, '', homeHref())
}
