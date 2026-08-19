export const DESKTOP_INSTALL_URL = 'https://github.com/bsv-blockchain/bsv-desktop'
export const DESK_STORAGE_KEY = 'grant-receipt.desk'
export const DONOR_STORAGE_KEY = 'grant-receipt.donor'
export const ORG_NAME_KEY = 'grant-receipt.orgName'
export const RECEIPT_CACHE_PREFIX = 'grant-receipt.public.'
export const OVERLAY_GIFTS_KEY = 'grant-receipt.overlay-gifts'

export const CHROME_ALLOW_HINT =
  'Chrome may ask to allow this site to talk to apps on this device. Allow, then try again, with Desktop unlocked.'

export const DECLINED_SPEND =
  'You declined the spend. Nothing was sent.'

export function originator(): string {
  if (typeof window === 'undefined') return 'localhost'
  return window.location.hostname
}

function peelJsonMessage(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{')) return trimmed
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    const parts = [parsed.message, parsed.description, parsed.error]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    if (parts.length > 0) return parts.join(' — ')
  } catch {
    // Not JSON — keep the original text.
  }
  return trimmed
}

function extractErrorText(error: unknown): string {
  if (error == null) return ''
  if (typeof error === 'string') return peelJsonMessage(error)
  if (error instanceof Error) {
    const extra = error as Error & { code?: string, description?: string, cause?: unknown }
    return [extra.message, extra.description, extra.code, extractErrorText(extra.cause)]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
      .map(peelJsonMessage)
      .join(' — ')
  }
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>
    return [record.message, record.description, record.error, record.code, record.status]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
      .map(peelJsonMessage)
      .join(' — ')
  }
  return peelJsonMessage(String(error))
}

function looksLikeWalletFailure(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    lower.includes('communication substrate') ||
    lower.includes('no wallet') ||
    lower.includes('wallet is not available') ||
    lower.includes('could not connect to a wallet')
  )
}

function looksLikeOverlayFailure(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    lower.includes('overlay broadcast') ||
    lower.includes('overlay submit') ||
    lower.includes('overlay rejected') ||
    lower.includes('tm_anytx') ||
    lower.includes('ls_anytx') ||
    lower.includes('hosts have rejected') ||
    lower.includes('err_all_hosts_rejected') ||
    lower.includes('overlay-us-1')
  )
}

function looksLikeRejected(text: string): boolean {
  const lower = text.toLowerCase()
  if (looksLikeOverlayFailure(lower)) return false
  return (
    lower.includes('permission denied') ||
    lower.includes('reject') ||
    lower.includes('denied') ||
    lower.includes('cancelled') ||
    lower.includes('canceled') ||
    lower.includes('user declined') ||
    lower.includes('spending request')
  )
}

function looksLikeTimeout(text: string): boolean {
  const lower = text.toLowerCase()
  return lower.includes('timeout') || lower.includes('timed out') || lower.includes('deadline')
}

function looksLikeWalletCallJson(text: string): boolean {
  return /"call"\s*:/.test(text) || text.includes('"createAction"') || text.includes('"args"')
}

/** Readable wallet text. Declines become a sentence; JSON is never shown. */
export function formatWalletError(error: unknown): string {
  const raw = extractErrorText(error).trim()
  if (looksLikeRejected(raw)) return DECLINED_SPEND
  if (looksLikeWalletFailure(raw) || looksLikeTimeout(raw)) return CHROME_ALLOW_HINT
  if (!raw || looksLikeWalletCallJson(raw) || raw.startsWith('{') || raw === '[object Object]') {
    return CHROME_ALLOW_HINT
  }
  return raw
}

export function errorMessage(error: unknown): string {
  return formatWalletError(error)
}

export function newGiftId(): string {
  return crypto.randomUUID()
}

export type AppRole = 'give' | 'desk'

export interface AppLocation {
  role: AppRole
  org?: string
  name?: string
  receiptTxid?: string
}

export function parseLocation(search = typeof window === 'undefined' ? '' : window.location.search): AppLocation {
  const params = new URLSearchParams(search)
  const receiptTxid = (params.get('receipt') || '').trim().toLowerCase()
  const org = (params.get('org') || '').trim()
  const name = (params.get('name') || '').trim()
  if (receiptTxid) {
    return { role: 'desk', org: org || undefined, name: name || undefined, receiptTxid }
  }
  if (params.get('give') === '1' || params.has('give') || org) {
    return { role: 'give', org: org || undefined, name: name || undefined }
  }
  return { role: 'desk', org: org || undefined, name: name || undefined }
}

export function roleHref(role: AppRole, extras?: { org?: string; name?: string }): string {
  const url = typeof window === 'undefined'
    ? new URL('https://example.invalid/')
    : new URL(window.location.href)
  url.search = ''
  if (role === 'give') url.searchParams.set('give', '1')
  if (extras?.org) url.searchParams.set('org', extras.org)
  if (extras?.name) url.searchParams.set('name', extras.name)
  return typeof window === 'undefined' ? url.search || '?' : url.toString()
}

export function receiptHref(txid: string): string {
  const url = typeof window === 'undefined'
    ? new URL('https://example.invalid/')
    : new URL(window.location.href)
  url.search = ''
  url.searchParams.set('receipt', txid)
  return typeof window === 'undefined' ? url.search : url.toString()
}

export function giveHref(orgIdentityKey: string, orgName?: string): string {
  return roleHref('give', { org: orgIdentityKey, name: orgName?.trim() || undefined })
}
