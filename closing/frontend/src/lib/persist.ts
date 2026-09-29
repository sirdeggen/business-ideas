import { emptyDesk, type DeskState } from '../../../protocol/closing'

const STORAGE_KEY = 'closing.desk'

export function saveDesk(closingId: string, desk: DeskState): void {
  if (typeof window === 'undefined') return
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  const all = raw ? JSON.parse(raw) as Record<string, DeskState> : {}
  all[closingId] = desk
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function loadDesk(closingId: string): DeskState | null {
  if (typeof window === 'undefined') return null
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const all = JSON.parse(raw) as Record<string, DeskState>
    const desk = all[closingId]
    if (!desk?.open || desk.open.closingId !== closingId) return null
    return { ...emptyDesk(), ...desk }
  } catch {
    return null
  }
}

export function clearDesk(closingId?: string): void {
  if (typeof window === 'undefined') return
  if (!closingId) {
    window.sessionStorage.removeItem(STORAGE_KEY)
    return
  }
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return
  try {
    const all = JSON.parse(raw) as Record<string, DeskState>
    delete all[closingId]
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    window.sessionStorage.removeItem(STORAGE_KEY)
  }
}
