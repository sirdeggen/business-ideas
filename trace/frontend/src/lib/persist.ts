import type { TraceReceipt } from '../../../protocol/trace'
import { RECEIPT_CACHE_KEY } from './config'

export interface CachedReceipt extends TraceReceipt {
  txid: string
  outputIndex: number
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

export function readCachedReceipts(): CachedReceipt[] {
  return readJson<CachedReceipt[]>(RECEIPT_CACHE_KEY, [])
}

export function writeCachedReceipts(receipts: CachedReceipt[]): void {
  writeJson(RECEIPT_CACHE_KEY, receipts)
}

export function mergeReceipts(cached: CachedReceipt[], incoming: CachedReceipt[]): CachedReceipt[] {
  const byToken = new Map<string, CachedReceipt>()
  for (const row of cached) {
    if (row.token) byToken.set(row.token, row)
  }
  for (const row of incoming) {
    if (row.token) byToken.set(row.token, row)
  }
  return [...byToken.values()]
}

/** Empty or failed ls_anytx must not wipe a receipt the desk already saw. */
export function keepLastGoodReceipts(
  cached: CachedReceipt[],
  incoming: CachedReceipt[],
  overlayFailedOrEmpty: boolean
): CachedReceipt[] {
  if (incoming.length > 0) return mergeReceipts(cached, incoming)
  if (overlayFailedOrEmpty && cached.length > 0) return cached
  return cached
}

export function cacheReceipt(receipt: CachedReceipt): CachedReceipt[] {
  const next = mergeReceipts(readCachedReceipts(), [receipt])
  writeCachedReceipts(next)
  return next
}

export function readCachedReceipt(token: string): CachedReceipt | null {
  return readCachedReceipts().find((row) => row.token === token) ?? null
}
