import type { CheckFlag, CheckReceipt } from '../../../protocol/check'

const STORAGE_KEY = 'check.desk'

export interface SavedDesk {
  flags: CheckFlag[]
  receipts: CheckReceipt[]
}

function empty(): SavedDesk {
  return { flags: [], receipts: [] }
}

export function loadSaved(): SavedDesk {
  if (typeof window === 'undefined') return empty()
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return empty()
  try {
    const parsed = JSON.parse(raw) as SavedDesk
    return {
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      receipts: Array.isArray(parsed.receipts) ? parsed.receipts : []
    }
  } catch {
    return empty()
  }
}

export function saveSaved(desk: SavedDesk): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(desk))
}

export function rememberReceipt(receipt: CheckReceipt): void {
  const saved = loadSaved()
  const receipts = [receipt, ...saved.receipts.filter((row) => row.checkId !== receipt.checkId)]
  saveSaved({ ...saved, receipts })
}

export function rememberFlag(flag: CheckFlag): void {
  const saved = loadSaved()
  const flags = [flag, ...saved.flags.filter((row) => row.flagId !== flag.flagId)]
  saveSaved({ ...saved, flags })
}

export function loadReceipt(checkId: string): CheckReceipt | null {
  return loadSaved().receipts.find((row) => row.checkId === checkId) ?? null
}
