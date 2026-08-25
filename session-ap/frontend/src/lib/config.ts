export const PUBLIC_OVERLAY_URL = 'https://overlay-us-1.bsvb.tech'
export const PUBLIC_TOPIC = 'tm_anytx'
export const PUBLIC_LOOKUP = 'ls_anytx'

const BAKED_OVERLAY_URL = (import.meta.env.VITE_OVERLAY_URL as string | undefined)?.trim() ?? ''

export const OVERLAY_STORAGE_KEY = 'session-ap.overlayUrl'
export const DRAFT_STORAGE_KEY = 'session-ap.drafts'
export const BOOK_CACHE_KEY = 'session-ap.last-good'

export const DESKTOP_INSTALL_URL = 'https://github.com/bsv-blockchain/bsv-desktop'

export const PUBLIC_OVERLAY_HINT =
  'Pages talks to the public overlay at overlay-us-1.bsvb.tech (tm_anytx / ls_anytx).'

export function isLocalhostUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url)
  }
}

export function isGitHubPages(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.hostname.endsWith('github.io')
}

export function originator(): string {
  if (typeof window === 'undefined') return 'localhost'
  return window.location.hostname
}

export function shortKey(key: string, size = 8): string {
  if (key.length <= size * 2) return key
  return `${key.slice(0, size)}…${key.slice(-6)}`
}

export const CHROME_ALLOW_HINT =
  'Unlock Desktop and try again. Chrome may ask to allow this site to talk to apps on this device. Allow, then Retry.'

export const DECLINED_SPEND =
  'You declined the spend. Nothing was sent.'

export const OVERLAY_ACTION_FAILED =
  'Couldn’t reach the overlay. Try again in a moment.'

export function resolveOverlayUrl(): string {
  const stored = typeof window === 'undefined'
    ? ''
    : (window.localStorage.getItem(OVERLAY_STORAGE_KEY) ?? '').trim()

  if (isGitHubPages()) {
    if (stored && !isLocalhostUrl(stored)) return stored
    return bakedOrPublic()
  }

  return stored || bakedOrPublic()
}

function bakedOrPublic(): string {
  if (isGitHubPages() && BAKED_OVERLAY_URL && isLocalhostUrl(BAKED_OVERLAY_URL)) {
    return PUBLIC_OVERLAY_URL
  }
  return BAKED_OVERLAY_URL || PUBLIC_OVERLAY_URL
}

export const DEFAULT_OVERLAY_URL = resolveOverlayUrl()

export function overlayHint(url = resolveOverlayUrl()): string {
  return PUBLIC_OVERLAY_HINT + (isLocalhostUrl(url) ? ` This page is pointed at ${url}.` : '')
}

export function overlayCheckFailed(probeError?: string | null, url = resolveOverlayUrl()): string {
  const detail = probeError?.trim()
  return detail ? `Overlay check failed: ${detail}` : `Overlay check failed at ${url}`
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
    lower.includes('no wallet available') ||
    lower.includes('no wallet found') ||
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
    lower.includes('overlay check failed') ||
    lower.includes('topical host') ||
    lower.includes('topical-host') ||
    lower.includes('tm_anytx') ||
    lower.includes('ls_anytx') ||
    lower.includes('hosts have rejected') ||
    lower.includes('err_all_hosts_rejected') ||
    lower.includes('overlay-us-1') ||
    lower.includes('steak') ||
    lower.includes('/submit') ||
    lower.includes('no outputs admitted') ||
    lower.includes('outputstoadmit')
  )
}

function looksLikeRejected(text: string): boolean {
  const lower = text.toLowerCase()
  if (looksLikeOverlayFailure(lower)) return false
  return (
    lower.includes('permission denied') ||
    lower.includes('user declined') ||
    /\bdeny(?:ing|ied)?\b/.test(lower) ||
    /\bcancel(?:led|ed|s|ling|ing)?\b/.test(lower)
  )
}

function looksLikeNetwork(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('err_network') ||
    lower.includes('econnrefused')
  )
}

function looksLikeTimeout(text: string): boolean {
  const lower = text.toLowerCase()
  return lower.includes('timeout') || lower.includes('timed out') || lower.includes('deadline')
}

function looksLikeWalletCallJson(text: string): boolean {
  return /"call"\s*:/.test(text) || text.includes('"createAction"') || text.includes('"args"')
}

function errorText(error: unknown): string {
  return `${formatWalletError(error)} ${extractErrorText(error)}`.trim()
}

export function isWalletMissing(error: unknown): boolean {
  if (error == null) return false
  const text = typeof error === 'string' ? error : errorText(error)
  if (looksLikeOverlayFailure(text) || looksLikeRejected(text) || looksLikeNetwork(text)) {
    return false
  }
  if (looksLikeTimeout(text) && !looksLikeWalletFailure(text)) return false
  return looksLikeWalletFailure(text)
}

export function formatWalletError(error: unknown): string {
  const raw = extractErrorText(error).trim()
  if (looksLikeRejected(raw)) return DECLINED_SPEND
  if (looksLikeOverlayFailure(raw)) return OVERLAY_ACTION_FAILED
  if (looksLikeWalletFailure(raw) || looksLikeTimeout(raw)) return CHROME_ALLOW_HINT
  if (!raw || looksLikeWalletCallJson(raw) || raw.startsWith('{') || raw === '[object Object]') {
    return CHROME_ALLOW_HINT
  }
  return raw
}

export function errorMessage(error: unknown): string {
  return formatWalletError(error)
}

export function todayIsoDate(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function defaultDueDate(): string {
  const due = new Date()
  due.setDate(due.getDate() + 14)
  const month = String(due.getMonth() + 1).padStart(2, '0')
  const day = String(due.getDate()).padStart(2, '0')
  return `${due.getFullYear()}-${month}-${day}`
}
