import { emptyDesk, type DeskState } from '../../../protocol/bounty'

const STORAGE_KEY = 'bounty.desk'

export function saveDesk(bountyId: string, desk: DeskState): void {
  if (typeof window === 'undefined') return
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  const all = raw ? JSON.parse(raw) as Record<string, DeskState> : {}
  all[bountyId] = desk
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function loadDesk(bountyId: string): DeskState | null {
  if (typeof window === 'undefined') return null
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const all = JSON.parse(raw) as Record<string, DeskState>
    const desk = all[bountyId]
    if (!desk?.fund || desk.fund.bountyId !== bountyId) return null
    return {
      ...emptyDesk(),
      ...desk,
      timeline: desk.timeline ?? [],
      exportText: desk.exportText ?? null
    }
  } catch {
    return null
  }
}

export function clearDesk(bountyId?: string): void {
  if (typeof window === 'undefined') return
  if (!bountyId) {
    window.sessionStorage.removeItem(STORAGE_KEY)
    return
  }
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return
  try {
    const all = JSON.parse(raw) as Record<string, DeskState>
    delete all[bountyId]
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    window.sessionStorage.removeItem(STORAGE_KEY)
  }
}
