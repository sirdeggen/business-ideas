export const DEFAULT_OVERLAY_URL =
  (import.meta.env.VITE_OVERLAY_URL as string | undefined) || 'http://localhost:8082'

export const OVERLAY_STORAGE_KEY = 'receivable-desk.overlayUrl'

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

export function formatSats(sats: number): string {
  return `${sats.toLocaleString()} sats`
}

export function isGitHubPages(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.hostname.endsWith('github.io')
}

export const LOCAL_DESK_HINT =
  'Mark paid needs the local desk: cd receivable-desk && docker compose up --build (index :8082, UI :5175). It does not run from GitHub Pages.'
