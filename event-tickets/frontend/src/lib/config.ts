export const DEFAULT_OVERLAY_URL =
  (import.meta.env.VITE_OVERLAY_URL as string | undefined) || 'http://localhost:8080'

export const OVERLAY_STORAGE_KEY = 'event-tickets.overlayUrl'

export const LOCAL_OVERLAY_HINT =
  'Overlay is local Docker, not GitHub Pages. Run: cd event-tickets && docker compose up --build (overlay :8080, UI :5173).'

export function originator(): string {
  if (typeof window === 'undefined') return 'localhost'
  return window.location.hostname
}

export function isGitHubPages(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.hostname.endsWith('github.io')
}

export function walletHint(): string {
  const host = typeof window === 'undefined' ? 'sirdeggen.github.io' : window.location.hostname
  return `Chrome hides BSV Desktop until you Allow “${host} wants to Access other apps and services on this device,” then Retry with Desktop unlocked.`
}

export function shortKey(key: string, size = 10): string {
  if (key.length <= size * 2) return key
  return `${key.slice(0, size)}…${key.slice(-6)}`
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
    lower.includes('overlay /lookup')
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
  if (looksLikeOverlayFailure(raw)) return LOCAL_OVERLAY_HINT
  if (looksLikeRejected(raw)) {
    return 'Wallet rejected the Spending Request. Approve it in BSV Desktop, or you cancelled.'
  }
  if (looksLikeTimeout(raw)) {
    return `Wallet request timed out. ${walletHint()}`
  }
  if (!raw) {
    return `Something failed with no message from the wallet or overlay. ${walletHint()} ${LOCAL_OVERLAY_HINT}`
  }
  return raw
}
