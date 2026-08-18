export const DESKTOP_INSTALL_URL = 'https://github.com/bsv-blockchain/bsv-desktop'
export const DESK_STORAGE_KEY = 'grant-receipt.desk'
export const DONOR_STORAGE_KEY = 'grant-receipt.donor'
export const ORG_NAME_KEY = 'grant-receipt.orgName'
export const RECEIPT_CACHE_PREFIX = 'grant-receipt.public.'

export const CHROME_ALLOW_HINT =
  'Chrome may ask to allow this site to talk to apps on this device. Allow, then try again, with Desktop unlocked.'

export function originator(): string {
  if (typeof window === 'undefined') return 'localhost'
  return window.location.hostname
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    const text = error.message.trim()
    const lower = text.toLowerCase()
    if (
      lower.includes('communication substrate') ||
      lower.includes('no wallet') ||
      lower.includes('timed out') ||
      lower.includes('timeout')
    ) {
      return CHROME_ALLOW_HINT
    }
    return text
  }
  if (typeof error === 'string' && error.trim()) return error
  return CHROME_ALLOW_HINT
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
