export const DEFAULT_FEED_URL =
  (import.meta.env.VITE_FEED_URL as string | undefined) || 'http://localhost:8080'

export const FEED_STORAGE_KEY = 'policy-treasury.feedUrl'
export const TREASURY_STORAGE_KEY = 'policy-treasury.id'

export function originator(): string {
  if (typeof window === 'undefined') return 'localhost'
  return window.location.hostname
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export function newId(): string {
  return crypto.randomUUID()
}
