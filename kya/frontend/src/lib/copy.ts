import { protocolFeeSats, type KyaStatus } from '../../../protocol/kya'

export const JOB = 'Verify who’s behind an agent before it acts.'
export const EYEBROW = 'Proof'
export const PRODUCT = 'Know Your Agent'
export const REGISTER_BUTTON = 'Register'
export const ISSUE_BUTTON = 'Issue'
export const VERIFY_BUTTON = 'Verify'
export const REGISTERING_BUTTON = 'Registering…'
export const ISSUING_BUTTON = 'Issuing…'
export const VERIFYING_BUTTON = 'Verifying…'
export const REGISTER_JOB = 'Name the agent and who stands behind it.'
export const ISSUE_JOB = 'Issue the signed credential for this agent.'
export const VERIFY_JOB = 'Pay a little to verify who stands behind this agent.'
export const STRANGER_LINE = 'Anyone with this link can read the credential. No wallet to look.'
export const STAMP_REGISTERED = 'Bound'
export const STAMP_ISSUED = 'Issued'
export const STAMP_VERIFIED = 'Verified'
export const NOT_OWNER = 'This wallet didn’t register the agent.'
export const NO_CREDENTIAL = 'Issue the credential before anyone can verify.'
export const FEE_LINE = 'A tiny protocol fee is labeled separately from the verify fee.'

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

export function stampFor(status: KyaStatus): string {
  switch (status) {
    case 'issued':
      return STAMP_ISSUED
    case 'verified':
      return STAMP_VERIFIED
    default:
      return STAMP_REGISTERED
  }
}

export function feeStory(verifySats: number): string {
  return `${FEE_LINE} Protocol fee ${protocolFeeSats(verifySats)} sats.`
}
