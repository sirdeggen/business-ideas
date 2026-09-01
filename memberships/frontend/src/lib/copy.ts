import { durationLabel, type KeyStatus } from '../../../protocol/membership'

export const JOB = 'A timed key. Renew when it expires.'
export const EYEBROW = 'Clubs'
export const PRODUCT = 'Membership'
export const DURATION_LABEL = 'Duration (days)'
export const CREATE_BUTTON = 'Create'
export const JOIN_BUTTON = 'Join'
export const RENEW_BUTTON = 'Renew'
export const CREATING_BUTTON = 'Creating…'
export const JOINING_BUTTON = 'Joining…'
export const RENEWING_BUTTON = 'Renewing…'
export const JOIN_JOB = 'Pay for a timed key.'
export const SHOW_VALID = 'Valid'
export const SHOW_EXPIRED = 'Expired'
export const EXPIRED_LINE = 'This key expired. Renew to walk in.'
export const STRANGER_LINE = 'Anyone with this link can read the name, price, and duration. No wallet to look.'

export function formatAmount(amount: number): string {
  return amount.toLocaleString('en-US')
}

export function formatWhen(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function validUntilLine(expiresAt: string): string {
  return `Good until ${formatWhen(expiresAt)}.`
}

export function showStamp(status: KeyStatus): string {
  return status === 'valid' ? SHOW_VALID : SHOW_EXPIRED
}

export function durationFace(durationSec: number): string {
  return durationLabel(durationSec)
}
