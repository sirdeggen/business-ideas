import {
  DESK_STORAGE_KEY,
  DONOR_STORAGE_KEY,
  ORG_NAME_KEY,
  OVERLAY_GIFTS_KEY,
  OVERLAY_RECEIPTS_KEY,
  RECEIPT_CACHE_PREFIX
} from './config'
import type { GiftRecord } from './machine'
import type { CanonicalReceipt, GiftNotice } from './protocol'

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

export function readGifts(which: 'desk' | 'donor'): GiftRecord[] {
  return readJson(which === 'desk' ? DESK_STORAGE_KEY : DONOR_STORAGE_KEY, [])
}

export function writeGifts(which: 'desk' | 'donor', gifts: GiftRecord[]): void {
  writeJson(which === 'desk' ? DESK_STORAGE_KEY : DONOR_STORAGE_KEY, gifts)
}

export function readOrgName(): string {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem(ORG_NAME_KEY) || ''
}

export function writeOrgName(name: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(ORG_NAME_KEY, name)
  } catch {
    // Private mode / quota.
  }
}

export interface CachedPublicReceipt {
  receipt: CanonicalReceipt
  signature: number[]
  signingKey: string
  announceTxid: string
}

export function readCachedReceipt(txid: string): CachedPublicReceipt | null {
  return readJson(`${RECEIPT_CACHE_PREFIX}${txid}`, null)
}

export function writeCachedReceipt(txid: string, value: CachedPublicReceipt): void {
  writeJson(`${RECEIPT_CACHE_PREFIX}${txid}`, value)
}

export function readCachedOverlayGifts(): GiftNotice[] {
  return readJson<GiftNotice[]>(OVERLAY_GIFTS_KEY, [])
}

export function writeCachedOverlayGifts(gifts: GiftNotice[]): void {
  writeJson(OVERLAY_GIFTS_KEY, gifts)
}

export function mergeGiftNotices(cached: GiftNotice[], incoming: GiftNotice[]): GiftNotice[] {
  const byId = new Map<string, GiftNotice>()
  for (const row of cached) {
    if (row.giftId) byId.set(row.giftId, row)
  }
  for (const row of incoming) {
    if (row.giftId) byId.set(row.giftId, row)
  }
  return [...byId.values()]
}

/** Empty or failed ls_anytx must not wipe a list the desk already saw. */
export function keepLastGoodGifts(
  cached: GiftNotice[],
  incoming: GiftNotice[],
  overlayFailedOrEmpty: boolean
): GiftNotice[] {
  if (incoming.length > 0) return mergeGiftNotices(cached, incoming)
  if (overlayFailedOrEmpty && cached.length > 0) return cached
  return cached
}

export function readCachedOverlayReceipts(): CachedPublicReceipt[] {
  return readJson<CachedPublicReceipt[]>(OVERLAY_RECEIPTS_KEY, [])
}

export function writeCachedOverlayReceipts(receipts: CachedPublicReceipt[]): void {
  writeJson(OVERLAY_RECEIPTS_KEY, receipts)
}

export function mergeReceiptAnnouncements(
  cached: CachedPublicReceipt[],
  incoming: CachedPublicReceipt[]
): CachedPublicReceipt[] {
  const byKey = new Map<string, CachedPublicReceipt>()
  const keyOf = (row: CachedPublicReceipt): string =>
    row.announceTxid || row.receipt.giftTxid
  for (const row of cached) {
    if (keyOf(row)) byKey.set(keyOf(row), row)
  }
  for (const row of incoming) {
    if (keyOf(row)) byKey.set(keyOf(row), row)
  }
  return [...byKey.values()]
}

/** Empty or failed ls_anytx must not wipe a receipt the donor already saw. */
export function keepLastGoodReceipts(
  cached: CachedPublicReceipt[],
  incoming: CachedPublicReceipt[],
  overlayFailedOrEmpty: boolean
): CachedPublicReceipt[] {
  if (incoming.length > 0) return mergeReceiptAnnouncements(cached, incoming)
  if (overlayFailedOrEmpty && cached.length > 0) return cached
  return cached
}
