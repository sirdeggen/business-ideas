import { nameError, normalizeName } from '../../../protocol/namelease'

/**
 * Deep links are query params only (`?name=`).
 * GitHub Pages 404s path routes like `/names/alice`.
 */
export function parseNameLocation(search: string, hash = ''): string | null {
  const fromSearch = readNameParam(search)
  if (fromSearch) return fromSearch
  const hashBody = hash.startsWith('#') ? hash.slice(1) : hash
  const hashQuery = hashBody.includes('?') ? hashBody.slice(hashBody.indexOf('?') + 1) : hashBody
  return readNameParam(hashQuery.startsWith('?') ? hashQuery : `?${hashQuery}`)
}

function readNameParam(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const raw = (params.get('name') ?? '').trim()
  if (!raw) return null
  const name = normalizeName(raw)
  return nameError(name) ? null : name
}

export function nameHref(name: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  const params = new URLSearchParams()
  params.set('name', normalizeName(name))
  return `${normalized}?${params.toString()}`
}

export function namePublicUrl(name: string): string {
  if (typeof window === 'undefined') return nameHref(name)
  return `${window.location.origin}${nameHref(name)}`
}

export function readNameFromLocation(): string | null {
  if (typeof window === 'undefined') return null
  return parseNameLocation(window.location.search, window.location.hash)
}

export function homeHref(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

export function goToName(name: string): void {
  window.history.replaceState({ name }, '', nameHref(name))
}

export function goHome(): void {
  window.history.replaceState({}, '', homeHref())
}
