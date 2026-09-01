import type { NameLease } from '../../../protocol/namelease'
import { LEASE_CACHE_KEY } from './config'

export interface CachedLease extends NameLease {
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

export function readCachedLeases(): CachedLease[] {
  return readJson<CachedLease[]>(LEASE_CACHE_KEY, [])
}

export function writeCachedLeases(leases: CachedLease[]): void {
  writeJson(LEASE_CACHE_KEY, leases)
}

export function mergeLeases(cached: CachedLease[], incoming: CachedLease[]): CachedLease[] {
  const byName = new Map<string, CachedLease>()
  for (const row of cached) {
    if (row.name) byName.set(row.name, row)
  }
  for (const row of incoming) {
    if (row.name) byName.set(row.name, row)
  }
  return [...byName.values()]
}

/** Empty or failed ls_anytx must not wipe a lease the desk already saw. */
export function keepLastGoodLeases(
  cached: CachedLease[],
  incoming: CachedLease[],
  overlayFailedOrEmpty: boolean
): CachedLease[] {
  if (incoming.length > 0) return mergeLeases(cached, incoming)
  if (overlayFailedOrEmpty && cached.length > 0) return cached
  return cached
}

export function cacheLease(lease: CachedLease): CachedLease[] {
  const next = mergeLeases(readCachedLeases(), [lease])
  writeCachedLeases(next)
  return next
}

export function readCachedLease(name: string): CachedLease | null {
  return readCachedLeases().find((row) => row.name === name) ?? null
}
