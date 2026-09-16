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

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'Clubs and programs sell access for a window — member until date X — not a one-night ticket and not a forever pass. Issue membership for that window, show active vs expired, and renew when it lapses.'

export const BUSINESS_CASE_WHO =
  'Clubs, churches, HOAs, gyms, and small enterprise membership programs (associations and paid communities; grassroots membership secretaries). Members pay dues; the org pays for (or takes a fee on) the membership rail.'

export const BUSINESS_CASE_MARKET =
  'Unlock Protocol (DefiLlama, fetched Sep 2026): ~$86K annualized fees (~$11.4K last 30d); ~$922K cumulative fees; protocol keeps 1% of key buy/renew — small on-chain GNP, not a creator-economy TAM. Patreon (Axios Aug 2025): creators paid out >$10B cumulative; >25M paid memberships — proves people pay for timed access off-chain. Gym/club membership-software market estimates vary widely; treat published “$XB TAM” figures as unknown unless sourced to a primary filing.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Other-chain analog: Unlock Protocol — timed membership keys / renewals with a live (small) fee stream on DefiLlama.'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: Patreon, MembershipWorks, Glow, gym membership software — orgs and fans already pay for “member until date X.”'

export const BUSINESS_CASE_DEMO =
  'Member pays dues for a timed window → access proves active until that date → after expiry access fails until they pay to renew. One visit: pay → value → proof. Not a forever pass.'

export const BUSINESS_CASE_CITATIONS = [
  {
    href: 'https://defillama.com/protocol/unlock',
    label: 'DefiLlama Sep 2026'
  },
  {
    href: 'https://www.axios.com/2025/08/05/patreon-10-billion-creator-economy-ai',
    label: 'Axios Aug 2025'
  }
] as const

export const BUSINESS_CASE_FIELDS = [
  'Why it exists',
  'Who pays',
  'Market signal',
  'Proof people pay',
  'Demo goal'
] as const

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
