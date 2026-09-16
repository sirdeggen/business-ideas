import { shortHash, type JobStatus } from '../../../protocol/jobescrow'

export const JOB = 'Fund a job. Lock until the hash lands.'
export const EYEBROW = 'Shop'
export const PRODUCT = 'Job escrow'
export const FUND_BUTTON = 'Fund'
export const SUBMIT_BUTTON = 'Submit'
export const RELEASE_BUTTON = 'Release'
export const CHALLENGE_BUTTON = 'Challenge'
export const REFUND_BUTTON = 'Refund'
export const FUNDING_BUTTON = 'Funding…'
export const SUBMITTING_BUTTON = 'Submitting…'
export const RELEASING_BUTTON = 'Releasing…'
export const CHALLENGING_BUTTON = 'Challenging…'
export const REFUNDING_BUTTON = 'Refunding…'
export const FUND_JOB = 'Label, provider, and amount. A stranger can read the ticket with no wallet.'
export const SUBMIT_JOB = 'Paste the deliverable hash.'
export const RELEASE_JOB = 'The hash landed. Release the lock, or challenge it.'
export const STRANGER_LINE = 'Anyone with this link can read the job. No wallet to look.'
export const STAMP_FUNDED = 'Locked'
export const STAMP_SUBMITTED = 'Hash in'
export const STAMP_CHALLENGED = 'Challenged'
export const STAMP_RELEASED = 'Released'
export const STAMP_REFUNDED = 'Refunded'
export const NOT_CLIENT = 'This wallet didn’t fund the job.'
export const NOT_PROVIDER = 'This wallet isn’t the named provider.'
export const NOT_HOLDING = 'This wallet doesn’t hold the locked job.'
export const FEE_STORY = 'A tiny protocol fee, about 2%, is the product story. v0 does not take it.'

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'Someone funds a discrete job and wants the money locked until the deliverable hash lands — a work order, not a perpetual stream. Don’t release until proof of work.'

export const BUSINESS_CASE_WHO =
  'Buyers funding contractor or agent jobs (enterprise: procurement / AI ops; grassroots: freelancers and small shops). Buyer funds escrow; the desk takes a cut on settlement.'

export const BUSINESS_CASE_MARKET =
  'TermiX (DefiLlama, fetched Sep 2026): 2% protocol fee on each escrow/campaign settlement; ~$307K fees in the last 30d; ~$428K cumulative — early but live job-escrow GNP. Request Network (public pricing): flat 0.9% per crypto payment (cap $500) — adjacent paid settlement rail, not a job-escrow TAM. Demo share of global freelance escrow GMV is unknown.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Other-chain analog: TermiX agent job escrow — fund → settle → 2% fee; Request Network paid requests for crypto settlement.'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: Upwork / milestone holds and construction retainage — buyers already pay platforms to lock funds until deliverable acceptance.'

export const BUSINESS_CASE_DEMO =
  'Fund → lock → hash lands → release, readable on a public receipt.'

export const BUSINESS_CASE_CITATIONS = [] as const

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

export function stampFor(status: JobStatus): string {
  switch (status) {
    case 'submitted':
      return STAMP_SUBMITTED
    case 'challenged':
      return STAMP_CHALLENGED
    case 'released':
      return STAMP_RELEASED
    case 'refunded':
      return STAMP_REFUNDED
    default:
      return STAMP_FUNDED
  }
}

export function hashFace(hash: string): string {
  return shortHash(hash, 8)
}
