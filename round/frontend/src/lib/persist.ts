import { emptyDesk, type DeskState } from '../../../protocol/round'

const STORAGE_KEY = 'round.desk'

export function saveDesk(roundId: string, desk: DeskState): void {
  if (typeof window === 'undefined') return
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  const all = raw ? JSON.parse(raw) as Record<string, DeskState> : {}
  all[roundId] = desk
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function loadDesk(roundId: string): DeskState | null {
  if (typeof window === 'undefined') return null
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const all = JSON.parse(raw) as Record<string, DeskState>
    const desk = all[roundId]
    if (!desk?.terms || desk.terms.roundId !== roundId) return null
    return {
      ...emptyDesk(),
      ...desk,
      eligibilities: desk.eligibilities ?? [],
      commits: desk.commits ?? [],
      close: desk.close ?? null
    }
  } catch {
    return null
  }
}

export function clearDesk(roundId?: string): void {
  if (typeof window === 'undefined') return
  if (!roundId) {
    window.sessionStorage.removeItem(STORAGE_KEY)
    return
  }
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return
  try {
    const all = JSON.parse(raw) as Record<string, DeskState>
    delete all[roundId]
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    window.sessionStorage.removeItem(STORAGE_KEY)
  }
}
