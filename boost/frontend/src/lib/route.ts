import { isProfileId } from '../../../protocol/boost'

const TXID = /^[0-9a-f]{64}$/i

export function isHintTxid(value: string | null | undefined): value is string {
  return typeof value === 'string' && TXID.test(value)
}

/**
 * Deep links are query params only (`?p=` / `?tx=`).
 * GitHub Pages 404s path routes like `/p/:id`.
 */
export function parseProfileLocation(
  search: string,
  hash = ''
): { profileId: string | null, hintTxid: string | null } {
  let profileId: string | null = null
  let hintTxid: string | null = null

  const read = (raw: string): void => {
    const searchParams = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw)
    const queryId = (searchParams.get('p') ?? '').trim()
    if (!profileId && isProfileId(queryId)) profileId = queryId.toLowerCase()
    const queryTx = (searchParams.get('tx') ?? '').trim()
    if (!hintTxid && isHintTxid(queryTx)) hintTxid = queryTx.toLowerCase()
  }

  read(search.startsWith('?') ? search.slice(1) : search)
  const hashBody = hash.startsWith('#') ? hash.slice(1) : hash
  const hashQuery = hashBody.includes('?') ? hashBody.slice(hashBody.indexOf('?') + 1) : ''
  if (hashQuery) read(hashQuery)

  return { profileId, hintTxid }
}

export function parseProfileLink(raw: string): { profileId: string | null, hintTxid: string | null } {
  const trimmed = raw.trim()
  if (!trimmed) return { profileId: null, hintTxid: null }
  if (isProfileId(trimmed)) return { profileId: trimmed.toLowerCase(), hintTxid: null }
  const queryIndex = trimmed.indexOf('?')
  const hashIndex = trimmed.indexOf('#')
  const search = queryIndex >= 0 ? trimmed.slice(queryIndex) : ''
  const hash = hashIndex >= 0 ? trimmed.slice(hashIndex) : ''
  return parseProfileLocation(search, hash)
}

export function profileHref(profileId: string, hintTxid?: string | null): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  const params = new URLSearchParams()
  params.set('p', profileId)
  if (isHintTxid(hintTxid)) params.set('tx', hintTxid.toLowerCase())
  return `${normalized}?${params.toString()}`
}

export function profilePublicUrl(profileId: string, hintTxid?: string | null): string {
  if (typeof window === 'undefined') return profileHref(profileId, hintTxid)
  return `${window.location.origin}${profileHref(profileId, hintTxid)}`
}

export function readProfileFromLocation(): { profileId: string | null, hintTxid: string | null } {
  if (typeof window === 'undefined') return { profileId: null, hintTxid: null }
  return parseProfileLocation(window.location.search, window.location.hash)
}

export function goToProfile(profileId: string, hintTxid?: string | null): void {
  window.history.replaceState({ profileId, hintTxid }, '', profileHref(profileId, hintTxid))
}

export function goHome(): void {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  window.history.replaceState({}, '', normalized)
}
