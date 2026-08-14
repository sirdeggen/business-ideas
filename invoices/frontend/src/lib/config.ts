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

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
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
