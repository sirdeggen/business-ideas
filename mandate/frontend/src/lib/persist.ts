import { emptyDesk, type DeskState } from '../../../protocol/mandate'

const STORAGE_KEY = 'mandate.desk'

export function saveDesk(mandateId: string, desk: DeskState): void {
  if (typeof window === 'undefined') return
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  const all = raw ? JSON.parse(raw) as Record<string, DeskState> : {}
  all[mandateId] = desk
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function loadDesk(mandateId: string): DeskState | null {
  if (typeof window === 'undefined') return null
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const all = JSON.parse(raw) as Record<string, DeskState>
    const desk = all[mandateId]
    if (!desk?.mandate || desk.mandate.mandateId !== mandateId) return null
    return {
      ...emptyDesk(),
      ...desk,
      funds: desk.funds ?? [],
      gains: desk.gains ?? [],
      sends: desk.sends ?? [],
      recalls: desk.recalls ?? [],
      changes: desk.changes ?? []
    }
  } catch {
    return null
  }
}

export function clearDesk(mandateId?: string): void {
  if (typeof window === 'undefined') return
  if (!mandateId) {
    window.sessionStorage.removeItem(STORAGE_KEY)
    return
  }
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return
  try {
    const all = JSON.parse(raw) as Record<string, DeskState>
    delete all[mandateId]
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    window.sessionStorage.removeItem(STORAGE_KEY)
  }
}
