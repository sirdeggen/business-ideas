import { isAgentId } from '../../../protocol/kya'

const TXID = /^[0-9a-f]{64}$/i

export function isHintTxid(value: string | null | undefined): value is string {
  return typeof value === 'string' && TXID.test(value)
}

/**
 * Deep links are query params only (`?a=` / `?tx=`).
 * GitHub Pages 404s path routes like `/a/:id`.
 */
export function parseAgentLocation(
  search: string,
  hash = ''
): { agentId: string | null, hintTxid: string | null } {
  let agentId: string | null = null
  let hintTxid: string | null = null

  const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const queryId = (searchParams.get('a') ?? '').trim()
  if (isAgentId(queryId)) agentId = queryId.toLowerCase()
  const queryTx = (searchParams.get('tx') ?? '').trim()
  if (isHintTxid(queryTx)) hintTxid = queryTx.toLowerCase()

  const hashBody = hash.startsWith('#') ? hash.slice(1) : hash
  const hashQuery = hashBody.includes('?') ? hashBody.slice(hashBody.indexOf('?') + 1) : hashBody.replace(/^#/, '')
  const hashParams = new URLSearchParams(hashQuery)
  const hashId = (hashParams.get('a') ?? '').trim()
  if (!agentId && isAgentId(hashId)) agentId = hashId.toLowerCase()
  const hashTx = (hashParams.get('tx') ?? '').trim()
  if (!hintTxid && isHintTxid(hashTx)) hintTxid = hashTx.toLowerCase()

  return { agentId, hintTxid }
}

export function agentHref(agentId: string, hintTxid?: string | null): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  const params = new URLSearchParams()
  params.set('a', agentId)
  if (isHintTxid(hintTxid)) params.set('tx', hintTxid.toLowerCase())
  return `${normalized}?${params.toString()}`
}

export function agentPublicUrl(agentId: string, hintTxid?: string | null): string {
  if (typeof window === 'undefined') return agentHref(agentId, hintTxid)
  return `${window.location.origin}${agentHref(agentId, hintTxid)}`
}

export function readAgentFromLocation(): { agentId: string | null, hintTxid: string | null } {
  if (typeof window === 'undefined') return { agentId: null, hintTxid: null }
  return parseAgentLocation(window.location.search, window.location.hash)
}

export function homeHref(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

export function goToAgent(agentId: string, hintTxid?: string | null): void {
  window.history.replaceState({ agentId, hintTxid }, '', agentHref(agentId, hintTxid))
}

export function goHome(): void {
  window.history.replaceState({}, '', homeHref())
}
