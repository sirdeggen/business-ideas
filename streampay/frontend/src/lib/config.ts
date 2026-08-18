export const PUBLIC_OVERLAY_URL = 'https://overlay-us-1.bsvb.tech'
export const PUBLIC_TOPIC = 'tm_anytx'
export const PUBLIC_LOOKUP = 'ls_anytx'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'
export const MESSAGE_BOX = 'streampay'

const BAKED_OVERLAY_URL = (import.meta.env.VITE_OVERLAY_URL as string | undefined)?.trim() ?? ''

export const OVERLAY_STORAGE_KEY = 'streampay.overlayUrl'
export const DESKTOP_INSTALL_URL = 'https://github.com/bsv-blockchain/bsv-desktop'

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

export function isPublicPagesHost(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.hostname.endsWith('github.io')
}

export const isGitHubPages = isPublicPagesHost

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

export function overlayHint(_url = resolveOverlayUrl()): string {
  return PUBLIC_OVERLAY_HINT
}

export const CHROME_ALLOW_HINT =
  'Chrome may ask to allow this site to talk to apps on this device. Allow, then Retry, with Desktop unlocked.'

export const DECLINED_APPROVAL_OPEN =
  'You declined the approval. Unlock Desktop and hit Open again.'

export const DECLINED_APPROVAL_CLAIM =
  'You declined the approval. Unlock Desktop and hit Claim again.'

export const DECLINED_APPROVAL_FREEZE =
  'You declined the approval. Unlock Desktop and hit Freeze again.'

export const OVERLAY_OPEN_FAILED =
  'Couldn’t open this stream. Try again in a moment.'

export const OVERLAY_CLAIM_FAILED =
  'Couldn’t claim this pay. Try again in a moment.'

export const OVERLAY_FREEZE_FAILED =
  'Couldn’t freeze this stream. Try again in a moment.'

export type ActionVerb = 'open' | 'claim' | 'freeze'

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

export function overlayFailureMessage(verb: ActionVerb = 'open'): string {
  if (verb === 'claim') return OVERLAY_CLAIM_FAILED
  if (verb === 'freeze') return OVERLAY_FREEZE_FAILED
  return OVERLAY_OPEN_FAILED
}

export function declinedMessage(verb: ActionVerb): string {
  if (verb === 'claim') return DECLINED_APPROVAL_CLAIM
  if (verb === 'freeze') return DECLINED_APPROVAL_FREEZE
  return DECLINED_APPROVAL_OPEN
}

export function errorMessage(error: unknown, verb: ActionVerb = 'open'): string {
  const raw = extractErrorText(error).trim()
  if (looksLikeOverlayFailure(raw)) return overlayFailureMessage(verb)
  if (looksLikeRejected(raw)) return declinedMessage(verb)
  if (looksLikeWalletFailure(raw) || looksLikeTimeout(raw)) return CHROME_ALLOW_HINT
  if (!raw || looksLikeWalletCallJson(raw) || raw.startsWith('{')) return CHROME_ALLOW_HINT
  return raw
}
