import { normalizeQuery } from '../../../protocol/vouch'

/**
 * Deep links are query params only (`?v=`).
 * GitHub Pages 404s path routes like `/vouch/a1b2…`.
 */
export function parseVouchLocation(search: string, hash = ''): string | null {
  const fromSearch = readVouchParam(search)
  if (fromSearch) return fromSearch
  const hashBody = hash.startsWith('#') ? hash.slice(1) : hash
  const hashQuery = hashBody.includes('?') ? hashBody.slice(hashBody.indexOf('?') + 1) : hashBody
  return readVouchParam(hashQuery.startsWith('?') ? hashQuery : `?${hashQuery}`)
}

function readVouchParam(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const raw = (params.get('v') ?? '').trim()
  if (!raw) return null
  const query = normalizeQuery(raw)
  return query || null
}

export function vouchHref(query: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  const params = new URLSearchParams()
  params.set('v', normalizeQuery(query))
  return `${normalized}?${params.toString()}`
}

export function vouchPublicUrl(query: string): string {
  if (typeof window === 'undefined') return vouchHref(query)
  return `${window.location.origin}${vouchHref(query)}`
}

export function readVouchFromLocation(): string | null {
  if (typeof window === 'undefined') return null
  return parseVouchLocation(window.location.search, window.location.hash)
}

export function homeHref(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

export function goToVouch(query: string): void {
  window.history.replaceState({ v: query }, '', vouchHref(query))
}

export function goHome(): void {
  window.history.replaceState({}, '', homeHref())
}
