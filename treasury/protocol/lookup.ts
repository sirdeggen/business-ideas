/**
 * Overlay ls_anytx is flaky. A known board can reconstruct on one fetch and
 * come back empty on the next. Never treat a blink as “the book is empty.”
 */

import { mergeEvents, reconstructTreasury, type BoardEvent, type Treasury } from './events.js'

export type OverlayLookupStatus = 'checking' | 'online' | 'failed'

export const MINUTES_COPY = {
  checking: 'Looking up minutes on overlay-us-1…',
  failed: 'Could not reach overlay-us-1. Minutes are not missing — lookup failed.',
  failedCached: 'Could not reach overlay-us-1. Showing last-good minutes (cached).',
  empty: 'No minutes for this board yet.'
} as const

export const LOOKUP_RETRY_ATTEMPTS = 3

export function overlayBanner(status: OverlayLookupStatus, usedCache = false): string {
  if (status === 'checking') return 'checking overlay-us-1'
  if (status === 'failed') {
    return usedCache
      ? 'lookup failed — minutes may be cached'
      : 'lookup failed'
  }
  return usedCache ? 'overlay-us-1 online · showing cached minutes' : 'overlay-us-1 online'
}

export function minutesEmptyCopy(input: {
  status: OverlayLookupStatus
  hasMinutes: boolean
  usedCache?: boolean
}): string | null {
  if (input.hasMinutes) return null
  if (input.status === 'checking') return MINUTES_COPY.checking
  if (input.status === 'failed') {
    return input.usedCache ? MINUTES_COPY.failedCached : MINUTES_COPY.failed
  }
  return MINUTES_COPY.empty
}

export function shouldRetryEmptyLookup(input: {
  treasuryId?: string
  found: number
  attempt: number
  maxAttempts?: number
}): boolean {
  const max = input.maxAttempts ?? LOOKUP_RETRY_ATTEMPTS
  return Boolean(input.treasuryId) && input.found === 0 && input.attempt < max
}

export async function retryEmptyLookup<T>(
  load: () => Promise<T[]>,
  opts?: {
    attempts?: number
    delayMs?: number
    pause?: (ms: number) => Promise<void>
  }
): Promise<{ items: T[]; attempts: number; failed: boolean; error?: string }> {
  const attempts = opts?.attempts ?? LOOKUP_RETRY_ATTEMPTS
  const delayMs = opts?.delayMs ?? 400
  const pause = opts?.pause ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  let failed = false
  let error: string | undefined

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const items = await load()
      if (items.length > 0) return { items, attempts: attempt, failed: false }
      if (attempt < attempts) await pause(delayMs * attempt)
    } catch (err) {
      failed = true
      error = err instanceof Error ? err.message : String(err)
      if (attempt < attempts) await pause(delayMs * attempt)
    }
  }

  return { items: [], attempts, failed, error }
}

/** Empty or failed overlay must not wipe a known minute book. */
export function keepLastGoodEvents(
  cached: BoardEvent[],
  incoming: BoardEvent[],
  overlayFailedOrEmpty: boolean
): BoardEvent[] {
  if (incoming.length > 0) return mergeEvents(cached, incoming)
  if (overlayFailedOrEmpty && cached.length > 0) return cached
  return cached
}

export function resolveMinutesView<T>(input: {
  inFlight: boolean
  overlayFailed: boolean
  live: T | null
  cached: T | null
}): {
  board: T | null
  status: OverlayLookupStatus
  emptyCopy: string | null
  usedCache: boolean
} {
  if (input.live) {
    return {
      board: input.live,
      status: input.inFlight ? 'checking' : 'online',
      emptyCopy: null,
      usedCache: false
    }
  }
  if (input.cached) {
    const status: OverlayLookupStatus = input.inFlight
      ? 'checking'
      : input.overlayFailed
        ? 'failed'
        : 'online'
    return {
      board: input.cached,
      status,
      emptyCopy: null,
      usedCache: true
    }
  }
  if (input.inFlight) {
    return {
      board: null,
      status: 'checking',
      emptyCopy: MINUTES_COPY.checking,
      usedCache: false
    }
  }
  if (input.overlayFailed) {
    return {
      board: null,
      status: 'failed',
      emptyCopy: MINUTES_COPY.failed,
      usedCache: false
    }
  }
  return {
    board: null,
    status: 'online',
    emptyCopy: MINUTES_COPY.empty,
    usedCache: false
  }
}

export function reconstructPreferringCache(
  incoming: BoardEvent[],
  cached: BoardEvent[],
  overlayFailedOrEmpty: boolean
): Treasury | null {
  const events = keepLastGoodEvents(cached, incoming, overlayFailedOrEmpty)
  return reconstructTreasury(events)
}

export function minutesAgo(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return iso
  const mins = Math.round((now - then) / 60_000)
  if (mins < 1) return 'just now'
  if (mins === 1) return '1 minute ago'
  if (mins < 60) return `${mins} minutes ago`
  const hours = Math.round(mins / 60)
  if (hours === 1) return '1 hour ago'
  if (hours < 48) return `${hours} hours ago`
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}
