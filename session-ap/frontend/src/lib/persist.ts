import { BOOK_CACHE_KEY, DRAFT_STORAGE_KEY } from './config'
import type { JoinedSession, SessionInvoice } from './protocol'

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

export function readDrafts(): SessionInvoice[] {
  return readJson<SessionInvoice[]>(DRAFT_STORAGE_KEY, [])
}

export function writeDrafts(drafts: SessionInvoice[]): void {
  writeJson(DRAFT_STORAGE_KEY, drafts)
}

export function upsertDraft(draft: SessionInvoice): SessionInvoice[] {
  const next = readDrafts().filter((row) => row.sessionId !== draft.sessionId)
  next.unshift(draft)
  writeDrafts(next)
  return next
}

export function removeDraft(sessionId: string): SessionInvoice[] {
  const next = readDrafts().filter((row) => row.sessionId !== sessionId)
  writeDrafts(next)
  return next
}

export function readCachedBooks(): JoinedSession[] {
  return readJson<JoinedSession[]>(BOOK_CACHE_KEY, [])
}

export function writeCachedBooks(books: JoinedSession[]): void {
  writeJson(BOOK_CACHE_KEY, books)
}

export function mergeBooks(cached: JoinedSession[], incoming: JoinedSession[]): JoinedSession[] {
  const byId = new Map<string, JoinedSession>()
  for (const row of cached) {
    if (row.sessionId) byId.set(row.sessionId, row)
  }
  for (const row of incoming) {
    if (row.sessionId) byId.set(row.sessionId, row)
  }
  return [...byId.values()]
}

/** Empty or failed ls_anytx must not wipe a book the desk already saw. */
export function keepLastGoodBooks(
  cached: JoinedSession[],
  incoming: JoinedSession[],
  overlayFailedOrEmpty: boolean
): JoinedSession[] {
  if (incoming.length > 0) return mergeBooks(cached, incoming)
  if (overlayFailedOrEmpty && cached.length > 0) return cached
  return cached
}

export function cacheBook(book: JoinedSession): JoinedSession[] {
  const next = mergeBooks(readCachedBooks(), [book])
  writeCachedBooks(next)
  return next
}

export function readCachedBook(sessionId: string): JoinedSession | null {
  return readCachedBooks().find((row) => row.sessionId === sessionId) ?? null
}
