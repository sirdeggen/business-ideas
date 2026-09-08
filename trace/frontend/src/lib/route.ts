import { normalizeQuery } from '../../../protocol/trace'

/**
 * Deep links are query params only (`?t=`).
 * GitHub Pages 404s path routes like `/trace/a1b2…`.
 */
export function parseTraceLocation(search: string, hash = ''): string | null {
  const fromSearch = readTraceParam(search)
  if (fromSearch) return fromSearch
  const hashBody = hash.startsWith('#') ? hash.slice(1) : hash
  const hashQuery = hashBody.includes('?') ? hashBody.slice(hashBody.indexOf('?') + 1) : hashBody
  return readTraceParam(hashQuery.startsWith('?') ? hashQuery : `?${hashQuery}`)
}

function readTraceParam(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const raw = (params.get('t') ?? '').trim()
  if (!raw) return null
  const query = normalizeQuery(raw)
  return query || null
}

export function traceHref(query: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  const params = new URLSearchParams()
  params.set('t', normalizeQuery(query))
  return `${normalized}?${params.toString()}`
}

export function tracePublicUrl(query: string): string {
  if (typeof window === 'undefined') return traceHref(query)
  return `${window.location.origin}${traceHref(query)}`
}

export function readTraceFromLocation(): string | null {
  if (typeof window === 'undefined') return null
  return parseTraceLocation(window.location.search, window.location.hash)
}

export function homeHref(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

export function goToTrace(query: string): void {
  window.history.replaceState({ t: query }, '', traceHref(query))
}

export function goHome(): void {
  window.history.replaceState({}, '', homeHref())
}
