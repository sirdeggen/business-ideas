import type { VouchAttest, VouchToken } from '../../../protocol/vouch'
import { RECEIPT_CACHE_KEY } from './config'

export interface CachedVouch extends VouchToken {
  txid: string
  outputIndex: number
}

export interface CachedAttest extends VouchAttest {
  txid: string
  outputIndex: number
}

export interface CachedDesk {
  vouches: CachedVouch[]
  attests: CachedAttest[]
}

function emptyDesk(): CachedDesk {
  return { vouches: [], attests: [] }
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private mode / quota.
  }
}

export function readCachedDesk(): CachedDesk {
  return readJson<CachedDesk>(RECEIPT_CACHE_KEY, emptyDesk())
}

export function writeCachedDesk(desk: CachedDesk): void {
  writeJson(RECEIPT_CACHE_KEY, desk)
}

export function mergeVouches(cached: CachedVouch[], incoming: CachedVouch[]): CachedVouch[] {
  const byId = new Map<string, CachedVouch>()
  for (const row of cached) {
    if (row.vouchId) byId.set(row.vouchId, row)
  }
  for (const row of incoming) {
    if (row.vouchId) byId.set(row.vouchId, row)
  }
  return [...byId.values()]
}

export function mergeAttests(cached: CachedAttest[], incoming: CachedAttest[]): CachedAttest[] {
  const byKey = new Map<string, CachedAttest>()
  for (const row of cached) {
    byKey.set(`${row.vouchId}:${row.timestamp}:${row.noteHash}`, row)
  }
  for (const row of incoming) {
    byKey.set(`${row.vouchId}:${row.timestamp}:${row.noteHash}`, row)
  }
  return [...byKey.values()]
}

/** Empty or failed ls_anytx must not wipe a vouch the desk already saw. */
export function keepLastGoodDesk(
  cached: CachedDesk,
  incoming: CachedDesk,
  overlayFailedOrEmpty: boolean
): CachedDesk {
  if (incoming.vouches.length > 0 || incoming.attests.length > 0) {
    return {
      vouches: mergeVouches(cached.vouches, incoming.vouches),
      attests: mergeAttests(cached.attests, incoming.attests)
    }
  }
  if (overlayFailedOrEmpty && (cached.vouches.length > 0 || cached.attests.length > 0)) {
    return cached
  }
  return cached
}

export function cacheVouch(vouch: CachedVouch): CachedDesk {
  const current = readCachedDesk()
  const next = {
    vouches: mergeVouches(current.vouches, [vouch]),
    attests: current.attests
  }
  writeCachedDesk(next)
  return next
}

export function cacheAttest(attest: CachedAttest): CachedDesk {
  const current = readCachedDesk()
  const next = {
    vouches: current.vouches,
    attests: mergeAttests(current.attests, [attest])
  }
  writeCachedDesk(next)
  return next
}

export function readCachedVouch(vouchId: string): CachedVouch | null {
  return readCachedDesk().vouches.find((row) => row.vouchId === vouchId) ?? null
}
