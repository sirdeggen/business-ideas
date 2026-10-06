import { emptyDesk, type DeskState } from '../../../protocol/scrip'

const STORAGE_KEY = 'scrip.desk'

export function saveDesk(scripId: string, desk: DeskState): void {
  if (typeof window === 'undefined') return
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  const all = raw ? JSON.parse(raw) as Record<string, DeskState> : {}
  all[scripId] = desk
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function loadDesk(scripId: string): DeskState | null {
  if (typeof window === 'undefined') return null
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const all = JSON.parse(raw) as Record<string, DeskState>
    const desk = all[scripId]
    if (!desk?.issue || desk.issue.scripId !== scripId) return null
    return {
      ...emptyDesk(),
      ...desk,
      mints: desk.mints ?? [],
      redeems: desk.redeems ?? [],
      attestations: desk.attestations ?? []
    }
  } catch {
    return null
  }
}

export function clearDesk(scripId?: string): void {
  if (typeof window === 'undefined') return
  if (!scripId) {
    window.sessionStorage.removeItem(STORAGE_KEY)
    return
  }
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return
  try {
    const all = JSON.parse(raw) as Record<string, DeskState>
    delete all[scripId]
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    window.sessionStorage.removeItem(STORAGE_KEY)
  }
}
