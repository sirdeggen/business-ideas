export const OVERLAY_STORAGE_KEY = 'invoices.overlayUrl'
export const DESKTOP_INSTALL_URL = 'https://github.com/bsv-blockchain/bsv-desktop'

const BAKED_OVERLAY_URL = (import.meta.env.VITE_OVERLAY_URL ?? '').trim()

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

/**
 * Public GitHub Pages never defaults to localhost. Local Vite/Docker may.
 * A baked VITE_OVERLAY_URL is used only when it is a reachable (non-localhost)
 * URL, or when we are not on the public host.
 */
export function resolveOverlayUrl(): string {
  const stored = typeof window === 'undefined'
    ? ''
    : (window.localStorage.getItem(OVERLAY_STORAGE_KEY) ?? '').trim()

  if (isPublicPagesHost()) {
    if (stored && !isLocalhostUrl(stored)) return stored
    if (BAKED_OVERLAY_URL && !isLocalhostUrl(BAKED_OVERLAY_URL)) return BAKED_OVERLAY_URL
    return ''
  }

  return stored || BAKED_OVERLAY_URL || 'http://localhost:8081'
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
