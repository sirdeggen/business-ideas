export const PUBLIC_OVERLAY_URL = 'https://overlay-us-1.bsvb.tech'
export const PUBLIC_TOPIC = 'tm_anytx'
export const PUBLIC_LOOKUP = 'ls_anytx'

const BAKED_OVERLAY_URL = (import.meta.env.VITE_OVERLAY_URL as string | undefined)?.trim() ?? ''

export const OVERLAY_STORAGE_KEY = 'event-tickets.overlayUrl'

export const LOCAL_OVERLAY_HINT =
  'Optional local Docker override: cd event-tickets && docker compose up --build (overlay :8080, UI :5173), then set Overlay URL to http://localhost:8080 for tm_tickets / ls_tickets.'

export const PUBLIC_OVERLAY_HINT =
  'Pages talks to the public overlay at overlay-us-1.bsvb.tech (tm_anytx / ls_anytx). No docker compose required.'

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

/**
 * Pages never defaults to localhost. Local Vite/Docker may still point at :8080
 * via VITE_OVERLAY_URL or the in-UI overlay URL (custom tm_tickets).
 */
export function resolveOverlayUrl(): string {
  const stored = typeof window === 'undefined'
    ? ''
    : (window.localStorage.getItem(OVERLAY_STORAGE_KEY) ?? '').trim()

  if (isGitHubPages()) {
    if (stored && !isLocalhostUrl(stored)) return stored
    if (BAKED_OVERLAY_URL && !isLocalhostUrl(BAKED_OVERLAY_URL)) return BAKED_OVERLAY_URL
    return PUBLIC_OVERLAY_URL
  }

  return stored || BAKED_OVERLAY_URL || PUBLIC_OVERLAY_URL
}

export const DEFAULT_OVERLAY_URL = resolveOverlayUrl()

export function originator(): string {
  if (typeof window === 'undefined') return 'localhost'
  return window.location.hostname
}

export function walletHint(): string {
  const host = typeof window === 'undefined' ? 'sirdeggen.github.io' : window.location.hostname
  return `Chrome hides BSV Desktop until you Allow “${host} wants to Access other apps and services on this device,” then Retry with Desktop unlocked.`
}

export function shortKey(key: string, size = 10): string {
  if (key.length <= size * 2) return key
  return `${key.slice(0, size)}…${key.slice(-6)}`
}

export function overlayHint(url = resolveOverlayUrl()): string {
  return isLocalhostUrl(url) ? LOCAL_OVERLAY_HINT : PUBLIC_OVERLAY_HINT
}

function extractErrorText(error: unknown): string {
  if (error == null) return ''
  if (typeof error === 'string') return error
  if (error instanceof Error) {
    const extra = error as Error & { code?: string, description?: string, cause?: unknown }
    return [extra.message, extra.description, extra.code, extractErrorText(extra.cause)]
      .filter((part) => typeof part === 'string' && part.trim())
      .join(' — ')
  }
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>
    return [record.message, record.description, record.error, record.code, record.status]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
      .join(' — ')
  }
  return String(error)
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
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('load failed') ||
    lower.includes('econnrefused') ||
    lower.includes('net::err_') ||
    lower.includes('overlay /submit') ||
    lower.includes('overlay /lookup') ||
    lower.includes('overlay broadcast') ||
    lower.includes('no competent') ||
    lower.includes('all hosts')
  )
}

function looksLikePublicOverlay(text: string): boolean {
  return (
    text.includes('overlay-us-1') ||
    text.includes('tm_anytx') ||
    text.includes('ls_anytx') ||
    !/localhost|127\.0\.0\.1/.test(text)
  )
}

function looksLikeRejected(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    lower.includes('reject') ||
    lower.includes('denied') ||
    lower.includes('cancelled') ||
    lower.includes('canceled')
  )
}

function looksLikeTimeout(text: string): boolean {
  const lower = text.toLowerCase()
  return lower.includes('timeout') || lower.includes('timed out') || lower.includes('deadline')
}

export function errorMessage(error: unknown): string {
  const raw = extractErrorText(error).trim()
  if (looksLikeWalletFailure(raw)) return walletHint()
  if (looksLikeOverlayFailure(raw)) {
    if (looksLikePublicOverlay(raw)) {
      return raw || PUBLIC_OVERLAY_HINT
    }
    return LOCAL_OVERLAY_HINT
  }
  if (looksLikeRejected(raw)) {
    return 'Wallet rejected the Spending Request. Approve it in BSV Desktop, or you cancelled.'
  }
  if (looksLikeTimeout(raw)) {
    return `Wallet request timed out. ${walletHint()}`
  }
  if (!raw) {
    return `Something failed with no message from the wallet or overlay. ${walletHint()} ${PUBLIC_OVERLAY_HINT}`
  }
  return raw
}
