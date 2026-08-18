import { DESK_STORAGE_KEY, DONOR_STORAGE_KEY, ORG_NAME_KEY, RECEIPT_CACHE_PREFIX } from './config'
import type { GiftRecord } from './machine'
import type { CanonicalReceipt } from './protocol'

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
