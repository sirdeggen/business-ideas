import { daysLate, isIdentityKey, utcIsoDate, type ReceivableStatus } from '../../../protocol/receivable'
import { samplePartyName } from '../../../protocol/samples'

/**
 * Treasurer-facing party label. Display names win. Identity keys are not
 * work-row titles — those stay under Advanced.
 */
export function partyName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (!isIdentityKey(trimmed)) return trimmed
  return samplePartyName(trimmed) ?? ''
}

export function workRowTitle(debtor: string, invoiceId: string): string {
  return partyName(debtor) || invoiceId
}

/** Age as a phrase on the row — not an aging report. */
export function agePhrase(dueDate: string, asOf = utcIsoDate()): string {
  const late = daysLate(dueDate, asOf)
  if (late > 1) return `${late} days overdue`
  if (late === 1) return '1 day overdue'
  if (late === 0) return 'Due today'
  if (late === -1) return 'Due tomorrow'

  const [year, month, day] = dueDate.split('-').map(Number)
  const due = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1))
  if (late >= -7) {
    const weekday = due.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
    return `Due ${weekday}`
  }
  return `Due ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
}

export type RowStatus = 'open' | 'overdue' | 'approved' | 'paid'

export function rowStatus(status: ReceivableStatus, dueDate: string, asOf = utcIsoDate()): RowStatus {
  if (status === 'paid') return 'paid'
  if (daysLate(dueDate, asOf) > 0) return 'overdue'
  if (status === 'approved') return 'approved'
  return 'open'
}

export function rowStatusLabel(status: RowStatus): string {
  if (status === 'overdue') return 'Overdue'
  if (status === 'approved') return 'Approved'
  if (status === 'paid') return 'Paid'
  return 'Open'
}
