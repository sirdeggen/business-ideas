export const PUBLIC_OVERLAY_URL = 'https://overlay-us-1.bsvb.tech'
export const PUBLIC_TOPIC = 'tm_anytx'
export const PUBLIC_LOOKUP = 'ls_anytx'

const BAKED_OVERLAY_URL = (import.meta.env.VITE_OVERLAY_URL as string | undefined)?.trim() ?? ''

export const OVERLAY_STORAGE_KEY = 'receivable-desk.overlayUrl'

/** Stale Pages builds baked :8081 (invoices overlay). Desk compose is :8082. */
const LEGACY_OVERLAY_URLS = new Set([
  'http://localhost:8081',
  'http://127.0.0.1:8081'
])

export const LOCAL_DESK_HINT =
  'Mark paid broadcasts to the overlay the UI is pointed at. Public Pages uses overlay-us-1 / tm_anytx. Local Docker is optional: cd receivable-desk && docker compose up --build (index :8082, UI :5175).'

export const LOCAL_OVERLAY_HINT =
  'Optional local Docker override: cd receivable-desk && docker compose up --build (overlay :8082, UI :5175), then set Overlay URL to http://localhost:8082 for tm_receivables / ls_receivables.'

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

export function originator(): string {
  if (typeof window === 'undefined') return 'localhost'
  return window.location.hostname
}

export function shortKey(key: string, size = 10): string {
  if (key.length <= size * 2) return key
  return `${key.slice(0, size)}…${key.slice(-6)}`
}

export const DESKTOP_INSTALL_URL = 'https://github.com/bsv-blockchain/bsv-desktop'

export const CHROME_ALLOW_HINT =
  'Unlock Desktop and try again. Chrome may ask to allow this site to talk to apps on this device. Allow, then Retry.'

export const DECLINED_APPROVAL_RECORD =
  'You declined the approval. Unlock Desktop and hit Record again.'

export const DECLINED_APPROVAL_REFRESH =
  'Unlock Desktop and hit Refresh again.'

export function walletHint(): string {
  const host = typeof window === 'undefined' ? 'sirdeggen.github.io' : window.location.hostname
  return `Chrome hides BSV Desktop until you Allow “${host} wants to Access other apps and services on this device,” then Retry with Desktop unlocked.`
}

/**
 * Pages never defaults to localhost. Local Vite/Docker may still point at :8082
 * via VITE_OVERLAY_URL or the in-UI overlay URL (custom tm_receivables).
 */
export function resolveOverlayUrl(): string {
  const stored = typeof window === 'undefined'
    ? ''
    : (window.localStorage.getItem(OVERLAY_STORAGE_KEY) ?? '').trim()

  if (stored) {
    const normalized = stored.replace(/\/$/, '')
    if (LEGACY_OVERLAY_URLS.has(normalized)) {
      const next = bakedOrPublic()
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(OVERLAY_STORAGE_KEY, next)
      }
      return next
    }
  }

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

export function storedOverlayUrl(): string {
  return resolveOverlayUrl()
}

export function overlayHint(url = resolveOverlayUrl()): string {
  return isLocalhostUrl(url) ? LOCAL_OVERLAY_HINT : PUBLIC_OVERLAY_HINT
}

/** Failed ping copy. Never substitute PUBLIC_OVERLAY_HINT for the probe error. */
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

function looksLikeRejected(text: string): boolean {
  const lower = text.toLowerCase()
  if (lower.includes('overlay rejected')) return false
  return (
    lower.includes('permission denied') ||
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

function looksLikeWalletCallJson(text: string): boolean {
  return /"call"\s*:/.test(text) || text.includes('"createAction"') || text.includes('"args"')
}

export function errorMessage(error: unknown, verb: 'record' | 'refresh' = 'record'): string {
  const raw = extractErrorText(error).trim()
  if (/spending request/i.test(raw)) return CHROME_ALLOW_HINT
  if (looksLikeRejected(raw)) {
    return verb === 'refresh' ? DECLINED_APPROVAL_REFRESH : DECLINED_APPROVAL_RECORD
  }
  if (looksLikeWalletFailure(raw) || looksLikeTimeout(raw)) return CHROME_ALLOW_HINT
  if (!raw || looksLikeWalletCallJson(raw) || raw.startsWith('{')) return CHROME_ALLOW_HINT
  return raw
}

export function formatSats(sats: number): string {
  return `${sats.toLocaleString()} sats`
}
