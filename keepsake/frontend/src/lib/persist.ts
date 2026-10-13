import { emptyDesk, type DeskState } from '../../../protocol/keepsake'

const STORAGE_KEY = 'keepsake.desk'

export function saveDesk(keepsakeId: string, desk: DeskState): void {
  if (typeof window === 'undefined') return
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  const all = raw ? JSON.parse(raw) as Record<string, DeskState> : {}
  all[keepsakeId] = desk
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function loadDesk(keepsakeId: string): DeskState | null {
  if (typeof window === 'undefined') return null
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const all = JSON.parse(raw) as Record<string, DeskState>
    const desk = all[keepsakeId]
    if (!desk?.edition || desk.edition.keepsakeId !== keepsakeId) return null
    return {
      ...emptyDesk(),
      ...desk,
      mints: desk.mints ?? [],
      sends: desk.sends ?? [],
      gifts: desk.gifts ?? [],
      shows: desk.shows ?? [],
      resales: desk.resales ?? []
    }
  } catch {
    return null
  }
}

export function clearDesk(keepsakeId?: string): void {
  if (typeof window === 'undefined') return
  if (!keepsakeId) {
    window.sessionStorage.removeItem(STORAGE_KEY)
    return
  }
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return
  try {
    const all = JSON.parse(raw) as Record<string, DeskState>
    delete all[keepsakeId]
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    window.sessionStorage.removeItem(STORAGE_KEY)
  }
}
