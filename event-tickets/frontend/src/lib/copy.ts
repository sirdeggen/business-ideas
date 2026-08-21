import { DEMO_EVENT } from '../../../protocol/ticket'

export const EVENT_NAME = DEMO_EVENT.name
export const EVENT_PLACE = DEMO_EVENT.venue

/** Upcoming event date for slips. Past dates are dropped — do not say tonight. */
export function eventWhenLine(startsAt: string, now = Date.now()): string | null {
  const start = Date.parse(startsAt)
  if (!Number.isFinite(start)) return null
  if (start < now) return null
  return formatPassDate(start)
}

/** Boarding-pass date as a fact. Never “tonight.” */
export function passDateLine(startsAt: string): string {
  const start = Date.parse(startsAt)
  if (!Number.isFinite(start)) return ''
  return formatPassDate(start)
}

function formatPassDate(start: number): string {
  return new Date(start).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

export function formatUsedAt(at = new Date()): string {
  return at.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}
