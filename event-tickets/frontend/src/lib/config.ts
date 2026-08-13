export const DEFAULT_OVERLAY_URL =
  (import.meta.env.VITE_OVERLAY_URL as string | undefined) || 'http://localhost:8080'

export const OVERLAY_STORAGE_KEY = 'event-tickets.overlayUrl'

export function originator(): string {
  if (typeof window === 'undefined') return 'localhost'
  return window.location.hostname
}

export function shortKey(key: string, size = 10): string {
  if (key.length <= size * 2) return key
  return `${key.slice(0, size)}…${key.slice(-6)}`
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
