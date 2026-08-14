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
