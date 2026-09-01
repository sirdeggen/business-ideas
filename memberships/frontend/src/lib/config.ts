export const PUBLIC_OVERLAY_URL = 'https://overlay-us-1.bsvb.tech'
export const PUBLIC_TOPIC = 'tm_anytx'
export const PUBLIC_LOOKUP = 'ls_anytx'

const BAKED_OVERLAY_URL = (import.meta.env.VITE_OVERLAY_URL as string | undefined)?.trim() ?? ''

export const OVERLAY_STORAGE_KEY = 'memberships.overlayUrl'
export const LAST_KEY_STORAGE_KEY = 'memberships.lastKey'

export const PUBLIC_OVERLAY_HINT =
  'This page talks to the public overlay. No docker compose required.'

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

export const DECLINED_APPROVAL =
  'You declined the approval. Unlock Desktop and try again.'

export const OVERLAY_ACTION_FAILED =
  'Couldn’t reach the overlay. Try again in a moment.'

export const OVERLAY_LOOKUP_FAILED =
  'Can’t reach overlay. Retry'

/**
 * Pages never defaults to localhost. Local Vite may still point at a host
 * via VITE_OVERLAY_URL or the in-UI overlay URL. Topic stays tm_anytx.
 */
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
  void url
  return PUBLIC_OVERLAY_HINT
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

function looksLikeWalletFailure(text: string): string | false {
  const lower = text.toLowerCase()
  return (
    lower.includes('communication substrate') ||
    lower.includes('no wallet available') ||
    lower.includes('no wallet found') ||
    lower.includes('wallet is not available') ||
    lower.includes('could not connect to a wallet')
  ) ? text : false
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
    lower.includes('reject') ||
    lower.includes('denied') ||
    lower.includes('cancelled') ||
    lower.includes('canceled') ||
    lower.includes('user declined')
  )
}

function looksLikeNetwork(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('err_network') ||
    lower.includes('err_internet') ||
    lower.includes('econnrefused') ||
    lower.includes('econnreset') ||
    lower.includes('enotfound')
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

/** True only when no wallet answered over any substrate — not overlay, network, or decline. */
export function isWalletMissing(error: unknown): boolean {
  if (error == null) return false
  const text = typeof error === 'string' ? error : errorText(error)
  if (looksLikeOverlayFailure(text) || looksLikeRejected(text) || looksLikeNetwork(text)) {
    return false
  }
  if (looksLikeTimeout(text) && !looksLikeWalletFailure(text)) return false
  return Boolean(looksLikeWalletFailure(text))
}

function fieldString(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

/** Raw createAction / overlay fields — surface the wallet or overlay text. */
export function formatWalletError(error: unknown): string {
  const parts: string[] = []
  const seen = new Set<string>()
  const push = (value: unknown): void => {
    const text = fieldString(value)
    if (!text || seen.has(text)) return
    seen.add(text)
    parts.push(text)
  }

  const walk = (value: unknown, depth = 0): void => {
    if (value == null || depth > 3) return
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed.startsWith('{')) {
        try {
          walk(JSON.parse(trimmed), depth + 1)
          return
        } catch {
          // Fall through to peeled text.
        }
      }
      push(peelJsonMessage(trimmed))
      return
    }
    if (value instanceof Error) {
      const extra = value as Error & { code?: unknown, description?: unknown, cause?: unknown }
      walk(extra.message, depth + 1)
      push(extra.code)
      push(extra.description)
      walk(extra.cause, depth + 1)
      return
    }
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>
      push(record.call)
      push(record.code)
      push(record.description)
      walk(record.message, depth + 1)
      push(record.error)
      walk(record.cause, depth + 1)
    }
  }

  walk(error)
  return parts.join(' — ')
}

export function errorMessage(error: unknown): string {
  const formatted = formatWalletError(error)
  const raw = extractErrorText(error).trim()
  if (raw === OVERLAY_LOOKUP_FAILED) return OVERLAY_LOOKUP_FAILED
  if (looksLikeRejected(formatted) || looksLikeRejected(raw)) return DECLINED_APPROVAL
  if (looksLikeOverlayFailure(formatted) || looksLikeOverlayFailure(raw)) {
    return OVERLAY_ACTION_FAILED
  }
  if (looksLikeWalletFailure(formatted) || looksLikeWalletFailure(raw)) return CHROME_ALLOW_HINT
  if (looksLikeTimeout(formatted) || looksLikeTimeout(raw) || raw === CHROME_ALLOW_HINT) {
    return CHROME_ALLOW_HINT
  }
  if (looksLikeWalletCallJson(formatted) || looksLikeWalletCallJson(raw)) return CHROME_ALLOW_HINT
  if (formatted) return formatted
  if (raw) return raw
  return 'Something went wrong.'
}

export function readLastKeyTxid(membershipId: string): string | null {
  if (typeof window === 'undefined') return null
  const raw = (window.localStorage.getItem(LAST_KEY_STORAGE_KEY) ?? '').trim()
  if (!raw) return null
  const [id, txid] = raw.split(':')
  if (id !== membershipId) return null
  return txid && /^[0-9a-f]{64}$/i.test(txid) ? txid.toLowerCase() : null
}

export function writeLastKeyTxid(membershipId: string, txid: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LAST_KEY_STORAGE_KEY, `${membershipId}:${txid.toLowerCase()}`)
}
