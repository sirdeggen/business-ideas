export const TREASURY_STORAGE_KEY = 'policy-treasury.id'

export function boardHref(treasuryId: string, createdTxid?: string): string {
  if (typeof window === 'undefined') {
    return createdTxid ? `?treasury=${treasuryId}&tx=${createdTxid}` : `?treasury=${treasuryId}`
  }
  const url = new URL(window.location.href)
  url.searchParams.set('treasury', treasuryId)
  if (createdTxid) url.searchParams.set('tx', createdTxid)
  else url.searchParams.delete('tx')
  return url.toString()
}

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
