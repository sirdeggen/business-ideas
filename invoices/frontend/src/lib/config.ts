export const PUBLIC_OVERLAY_URL = 'https://overlay-us-1.bsvb.tech'
export const PUBLIC_TOPIC = 'tm_anytx'
export const PUBLIC_LOOKUP = 'ls_anytx'

const BAKED_OVERLAY_URL = (import.meta.env.VITE_OVERLAY_URL as string | undefined)?.trim() ?? ''

export const OVERLAY_STORAGE_KEY = 'invoices.overlayUrl'
export const DESKTOP_INSTALL_URL = 'https://github.com/bsv-blockchain/bsv-desktop'

export const LOCAL_OVERLAY_HINT =
  'Optional local Docker override: cd invoices && docker compose up --build (overlay :8081, UI :5174), then set Overlay URL to http://localhost:8081 for tm_invoices / ls_invoices.'

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

export function isPublicPagesHost(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.hostname.endsWith('github.io')
}

export const isGitHubPages = isPublicPagesHost

/**
 * Pages never defaults to localhost. Local Vite/Docker may still point at :8081
 * via the in-UI overlay URL (custom tm_invoices).
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

export function shortKey(key: string, size = 10): string {
  if (key.length <= size * 2) return key
  return `${key.slice(0, size)}…${key.slice(-6)}`
}

export function overlayHint(url = resolveOverlayUrl()): string {
  return isLocalhostUrl(url) ? LOCAL_OVERLAY_HINT : PUBLIC_OVERLAY_HINT
}

export const CHROME_ALLOW_HINT =
  'Chrome may ask to allow this site to talk to apps on this device. Allow, then Retry, with Desktop unlocked.'

export const DECLINED_APPROVAL_SEND =
  'You declined the approval. Unlock Desktop and hit Send again.'

export const DECLINED_APPROVAL_PAY =
  'You declined the approval. Unlock Desktop and hit Pay again.'

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
      .filter((part) => typeof part === 'string' && part.trim())
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

function looksLikeAlreadyPaid(text: string): boolean {
  return text.toLowerCase().includes('already paid')
}

function looksLikeRejected(text: string): boolean {
  const lower = text.toLowerCase()
  if (looksLikeAlreadyPaid(lower)) return false
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

export function errorMessage(error: unknown, verb: 'send' | 'pay' = 'send'): string {
  const raw = extractErrorText(error).trim()
  if (looksLikeAlreadyPaid(raw)) return raw
  if (looksLikeRejected(raw)) {
    return verb === 'pay' ? DECLINED_APPROVAL_PAY : DECLINED_APPROVAL_SEND
  }
  if (looksLikeWalletFailure(raw) || looksLikeTimeout(raw)) return CHROME_ALLOW_HINT
  if (!raw || looksLikeWalletCallJson(raw) || raw.startsWith('{')) return CHROME_ALLOW_HINT
  return raw
}

export function todayIsoDate(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function defaultDueDate(): string {
  const due = new Date()
  due.setDate(due.getDate() + 7)
  const y = due.getFullYear()
  const m = String(due.getMonth() + 1).padStart(2, '0')
  const d = String(due.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatSats(amount: number): string {
  return `${amount.toLocaleString('en-US')} sats`
}
