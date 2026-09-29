import {
  CLAIM_ADMIN_FEE_SATS,
  formatSats,
  type CoverKind
} from '../../../protocol/cover'

export const JOB = 'Buy cover. Get a policy record. File a claim that releases only when the right people agree.'
export const EYEBROW = 'Cover'
export const PRODUCT = 'Cover Desk'
export const BUY_BUTTON = 'Buy cover'
export const BUYING_BUTTON = 'Buying cover…'
export const FILE_BUTTON = 'File claim'
export const FILING_BUTTON = 'Filing claim…'
export const APPROVE_BUTTON = 'Approve'
export const APPROVING_BUTTON = 'Approving…'
export const RELEASE_BUTTON = 'Release'
export const RELEASING_BUTTON = 'Releasing…'
export const EXPORT_BUTTON = 'Export reading'
export const BUY_JOB = 'Pick the risk, the insured amount, and the term. The premium and the desk fee are on the quote.'
export const FILE_JOB = 'File a claim against this policy. Add evidence as text or a file. Only a hash is kept.'
export const APPROVE_JOB = 'Approvers agree here. The claim releases when enough of them have agreed.'
export const RELEASE_JOB = 'Release records the payout and the labeled claim-admin fee.'
export const STRANGER_LINE = 'Anyone with this link can read the policy and the claim. No wallet to look.'
export const QUOTE_WAIT = 'Enter an insured amount and a term to see the premium.'
export const PREMIUM_LABEL = 'Premium'
export const PREMIUM_CUT_LABEL = 'Premium cut'
export const CLAIM_ADMIN_LABEL = 'Claim-admin fee'
export const FEE_FACE = 'Premium cut is the desk fee. It is listed on the quote, not taken quietly.'
export const PAYOUT_NOTE = 'The payout amount is recorded. v0 does not hold that amount or pay it out. The claim-admin fee is labeled and recorded, not proven paid.'
export const RECORDED_ONLY = 'Recorded only, no pool backs this payout.'
export const DESK_DEFAULT = 'Leave the desk key blank and the premium and the claim-admin fee are paid to this wallet.'
export const APPROVER_HINT = 'Each approver is a 66-character cover key starting with 02 or 03. Example shape: 02 followed by 64 hex characters. Ask each person for the cover key their wallet signs with.'
export const EVIDENCE_TRIM = 'The note is trimmed before it is hashed. Spaces at the ends are not part of the mark.'
export const RELEASED_WORD = 'Released'
export const NOT_HOLDER = 'This wallet didn’t buy the policy.'
export const NOT_APPROVER = 'This wallet isn’t an approver on the policy.'
export const ALREADY_APPROVED = 'You already approved this claim.'
export const ALREADY_CLAIMED = 'This policy already has a claim.'
export const ALREADY_RELEASED = 'This claim is already released.'
export const NEED_QUORUM = 'This claim needs more approvals.'
export const NOT_RELEASER = 'An approver who already agreed can release.'
export const NEED_APPROVERS = 'Name three different approvers.'
export const NEED_EVIDENCE = 'Paste what happened, or pick a file. Nothing is uploaded.'
export const TERM_ENDED = 'This policy’s term has ended.'
export const EMPTY_LIST = 'No policies yet.'
export const HONESTY_LINE = 'The premium and the claim-admin fee are paid in sats. The payout amount is recorded when the claim is released. v0 does not hold a pool that pays that amount.'
export const DISTINCT_LINE = 'Cover for one operational risk. Not a trust bond, a loan, a gift, or a work order.'

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'Organizations buy cover against specific operational risks — contract failure, event cancellation, contractor default — and need a clear premium, a policy record, and a claim path that isn’t email chaos.'

export const BUSINESS_CASE_WHO =
  'Enterprises and grassroots orgs (clubs, co-ops, event hosts) that already budget insurance or mutual-aid premiums; claim admins who need an auditable release.'

export const BUSINESS_CASE_MARKET =
  'Nexus Mutual retained ~$47.2k protocol revenue and ~$94.4k fees over 30 days with ~$115M TVL (DefiLlama, 2026-09-29). These comps are Nexus Mutual and adjacent protocols only. There is no direct public comp for club or co-op cover.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Other-chain analog: Nexus Mutual cover premiums, per DefiLlama.'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: mutuals and specialty insurers charging premiums for contract, event, and contractor cover.'

export const BUSINESS_CASE_DEMO =
  'In one visit, buy a cover policy, see the policy record, and walk a claim file to a multi-party release — with a desk fee visible.'

export const BUSINESS_CASE_CITATIONS = [
  {
    href: 'https://defillama.com/protocol/nexus-mutual',
    label: 'DefiLlama Nexus Mutual'
  }
] as const

export const BUSINESS_CASE_FIELDS = [
  'Why it exists',
  'Who pays',
  'Market signal',
  'Proof people pay',
  'Demo goal'
] as const

const KIND_FACE: Record<CoverKind, string> = {
  contract: 'Contract failure',
  event: 'Event cancellation',
  contractor: 'Contractor default'
}

export function coverKindLabel(kind: CoverKind): string {
  return KIND_FACE[kind]
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

export function approvalLine(count: number, quorum: number): string {
  const noun = count === 1 ? 'approval' : 'approvals'
  return `${count} of ${quorum} ${noun}`
}

export function claimAdminFace(): string {
  return `${CLAIM_ADMIN_LABEL} ${formatSats(CLAIM_ADMIN_FEE_SATS)} when this claim is released.`
}
